-- Performance audit (2026-10-19): add indexes on columns used in admin-list ORDER BY / analytics
-- range filters that previously had no index, flagged as a scalability risk as the tables grow.
ALTER TABLE `Content` ADD INDEX `Content_createdAt_idx`(`createdAt`);
ALTER TABLE `User` ADD INDEX `User_createdAt_idx`(`createdAt`);
ALTER TABLE `Payment` ADD INDEX `Payment_paidAt_idx`(`paidAt`);
