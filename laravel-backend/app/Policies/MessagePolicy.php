<?php

namespace App\Policies;

use App\Models\Message;
use App\Models\User;

class MessagePolicy extends BasePolicy
{
    /**
     * Can the user list messages?
     * All authenticated users in the same tenant.
     */
    public function viewAny(User $user): bool
    {
        return true;
    }

    /**
     * Can the user view this message?
     * Same tenant AND user is sender or recipient.
     */
    public function view(User $user, Message $message): bool
    {
        if (!$this->sameTenant($user, $message)) {
            return false;
        }

        return $user->id === $message->sender_id
            || $user->id === $message->recipient_id;
    }

    /**
     * Can the user create a message?
     * All authenticated users in the same tenant.
     */
    public function create(User $user): bool
    {
        return true;
    }
}
