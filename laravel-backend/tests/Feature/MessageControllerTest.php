<?php

namespace Tests\Feature;

use App\Models\Message;
use App\Models\Practice;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Str;
use Tests\TestCase;

class MessageControllerTest extends TestCase
{
    use RefreshDatabase;

    // ── Helpers ──────────────────────────────────────────────────────

    private function createPractice(array $overrides = []): Practice
    {
        return Practice::create(array_merge([
            'name' => 'Test Practice',
            'slug' => 'test-practice-' . Str::random(6),
            'email' => 'admin@testpractice.com',
            'is_active' => true,
            'subscription_status' => 'active',
        ], $overrides));
    }

    private function createUser(Practice $practice, string $role, array $overrides = []): User
    {
        return User::create(array_merge([
            'tenant_id' => $practice->id,
            'name' => fake()->name(),
            'first_name' => fake()->firstName(),
            'last_name' => fake()->lastName(),
            'email' => fake()->unique()->safeEmail(),
            'password' => bcrypt('password'),
            'role' => $role,
        ], $overrides));
    }

    private function actingAsUser(User $user): static
    {
        return $this->actingAs($user, 'sanctum');
    }

    private function createMessage(
        Practice $practice,
        User $sender,
        User $recipient,
        ?string $threadId = null,
        array $overrides = [],
    ): Message {
        return Message::create(array_merge([
            'tenant_id' => $practice->id,
            'thread_id' => $threadId ?? (string) Str::uuid(),
            'sender_id' => $sender->id,
            'recipient_id' => $recipient->id,
            'body' => 'Test message body',
            'is_system_message' => false,
        ], $overrides));
    }

    // ── Tests ────────────────────────────────────────────────────────

    public function test_user_can_list_messages(): void
    {
        $practice = $this->createPractice();
        $userA = $this->createUser($practice, 'practice_admin');
        $userB = $this->createUser($practice, 'patient');

        $threadId = (string) Str::uuid();
        $this->createMessage($practice, $userA, $userB, $threadId);
        $this->createMessage($practice, $userB, $userA, $threadId, ['body' => 'Reply message']);

        $response = $this->actingAsUser($userA)
            ->getJson('/api/messages');

        $response->assertOk()
            ->assertJsonStructure([
                'data' => [
                    '*' => ['id', 'thread_id', 'sender_id', 'recipient_id', 'body'],
                ],
            ]);

        // Should see threads grouped — 1 thread
        $this->assertCount(1, $response->json('data'));
    }

    public function test_user_can_send_message(): void
    {
        $practice = $this->createPractice();
        $sender = $this->createUser($practice, 'practice_admin');
        $recipient = $this->createUser($practice, 'patient');

        $response = $this->actingAsUser($sender)
            ->postJson('/api/messages', [
                'recipient_id' => $recipient->id,
                'body' => 'Hello, this is a test message.',
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.sender_id', $sender->id)
            ->assertJsonPath('data.recipient_id', $recipient->id);

        // Body is encrypted at rest but Eloquent decrypts it transparently
        $this->assertEquals('Hello, this is a test message.', $response->json('data.body'));

        // Verify a thread_id was auto-generated
        $this->assertNotNull($response->json('data.thread_id'));
    }

    public function test_user_can_send_message_to_existing_thread(): void
    {
        $practice = $this->createPractice();
        $userA = $this->createUser($practice, 'practice_admin');
        $userB = $this->createUser($practice, 'patient');

        $threadId = (string) Str::uuid();
        $this->createMessage($practice, $userA, $userB, $threadId);

        // Reply in the same thread
        $response = $this->actingAsUser($userB)
            ->postJson('/api/messages', [
                'recipient_id' => $userA->id,
                'body' => 'This is a reply.',
                'thread_id' => $threadId,
            ]);

        $response->assertCreated()
            ->assertJsonPath('data.thread_id', $threadId);
    }

    public function test_user_can_view_thread(): void
    {
        $practice = $this->createPractice();
        $userA = $this->createUser($practice, 'practice_admin');
        $userB = $this->createUser($practice, 'patient');

        $threadId = (string) Str::uuid();
        $this->createMessage($practice, $userA, $userB, $threadId, ['body' => 'First message']);
        $this->createMessage($practice, $userB, $userA, $threadId, ['body' => 'Second message']);
        $this->createMessage($practice, $userA, $userB, $threadId, ['body' => 'Third message']);

        $response = $this->actingAsUser($userA)
            ->getJson("/api/messages/thread/{$threadId}");

        $response->assertOk()
            ->assertJsonCount(3, 'data');

        // Messages should be ordered by created_at ascending
        $messages = $response->json('data');
        $this->assertEquals('First message', $messages[0]['body']);
        $this->assertEquals('Third message', $messages[2]['body']);
    }

    public function test_view_thread_returns_404_for_nonexistent_thread(): void
    {
        $practice = $this->createPractice();
        $user = $this->createUser($practice, 'practice_admin');

        $response = $this->actingAsUser($user)
            ->getJson('/api/messages/thread/' . Str::uuid());

        $response->assertNotFound();
    }

    public function test_user_can_mark_message_as_read(): void
    {
        $practice = $this->createPractice();
        $sender = $this->createUser($practice, 'practice_admin');
        $recipient = $this->createUser($practice, 'patient');

        $message = $this->createMessage($practice, $sender, $recipient);

        $this->assertNull($message->read_at);

        $response = $this->actingAsUser($recipient)
            ->putJson("/api/messages/{$message->id}/read");

        $response->assertOk();
        $this->assertNotNull($response->json('data.read_at'));

        $this->assertDatabaseHas('messages', [
            'id' => $message->id,
        ]);

        // Verify read_at is set in the DB
        $message->refresh();
        $this->assertNotNull($message->read_at);
    }

    public function test_only_recipient_can_mark_message_as_read(): void
    {
        $practice = $this->createPractice();
        $sender = $this->createUser($practice, 'practice_admin');
        $recipient = $this->createUser($practice, 'patient');

        $message = $this->createMessage($practice, $sender, $recipient);

        // Sender tries to mark as read — should fail (findOrFail scopes to recipient_id)
        $response = $this->actingAsUser($sender)
            ->putJson("/api/messages/{$message->id}/read");

        $response->assertNotFound();
    }

    public function test_unread_count_endpoint(): void
    {
        $practice = $this->createPractice();
        $userA = $this->createUser($practice, 'practice_admin');
        $userB = $this->createUser($practice, 'patient');

        // Send 3 messages to userB (all unread)
        for ($i = 0; $i < 3; $i++) {
            $this->createMessage($practice, $userA, $userB);
        }

        // Send 1 message the other way (not counted for userB)
        $this->createMessage($practice, $userB, $userA);

        $response = $this->actingAsUser($userB)
            ->getJson('/api/messages/unread-count');

        $response->assertOk()
            ->assertJsonPath('data.unread_count', 3);

        // Mark one as read
        $firstMessage = Message::where('recipient_id', $userB->id)->first();
        $firstMessage->update(['read_at' => now()]);

        $response2 = $this->actingAsUser($userB)
            ->getJson('/api/messages/unread-count');

        $response2->assertOk()
            ->assertJsonPath('data.unread_count', 2);
    }

    public function test_tenant_isolation_on_messages(): void
    {
        // Practice A
        $practiceA = $this->createPractice(['slug' => 'msg-iso-a-' . Str::random(6)]);
        $userA1 = $this->createUser($practiceA, 'practice_admin');
        $userA2 = $this->createUser($practiceA, 'patient');

        $threadA = (string) Str::uuid();
        $this->createMessage($practiceA, $userA1, $userA2, $threadA, ['body' => 'Practice A message']);

        // Practice B
        $practiceB = $this->createPractice(['slug' => 'msg-iso-b-' . Str::random(6)]);
        $userB1 = $this->createUser($practiceB, 'practice_admin');
        $userB2 = $this->createUser($practiceB, 'patient');

        $threadB = (string) Str::uuid();
        $this->createMessage($practiceB, $userB1, $userB2, $threadB, ['body' => 'Practice B message']);

        // User A1 should only see Practice A's messages
        $response = $this->actingAsUser($userA1)
            ->getJson('/api/messages');

        $response->assertOk();
        $threads = $response->json('data');
        $this->assertCount(1, $threads);
        $this->assertEquals($practiceA->id, $threads[0]['tenant_id']);

        // User A1 cannot view Practice B's thread
        $response2 = $this->actingAsUser($userA1)
            ->getJson("/api/messages/thread/{$threadB}");

        $response2->assertNotFound();

        // Unread count for user A1 should not include Practice B's messages
        $unreadResponse = $this->actingAsUser($userA1)
            ->getJson('/api/messages/unread-count');

        $unreadResponse->assertOk();
        // userA1 is a sender, so 0 unread for them
        $this->assertEquals(0, $unreadResponse->json('data.unread_count'));
    }

    public function test_send_message_validates_required_fields(): void
    {
        $practice = $this->createPractice();
        $user = $this->createUser($practice, 'practice_admin');

        $response = $this->actingAsUser($user)
            ->postJson('/api/messages', []);

        $response->assertUnprocessable()
            ->assertJsonValidationErrors(['recipient_id', 'body']);
    }
}
