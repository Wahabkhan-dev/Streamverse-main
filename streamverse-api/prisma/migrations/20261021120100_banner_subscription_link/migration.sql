-- A banner button may open the Subscription (plans) page.
ALTER TABLE `Banner` ADD COLUMN `linkToSubscription` BOOLEAN NOT NULL DEFAULT false;
