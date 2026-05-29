-- 020: Add 'join' notification type for invite acceptance
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'join';
