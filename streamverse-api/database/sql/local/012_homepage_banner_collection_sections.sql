-- Homepage sections can be a Banner (picked from the Banner library) or a Collection; position is the section's displayOrder.
ALTER TABLE `homepagesection`
  ADD COLUMN `bannerId` VARCHAR(191) NULL,
  ADD COLUMN `collectionId` VARCHAR(191) NULL;
CREATE INDEX `HomepageSection_displayOrder_idx` ON `homepagesection`(`displayOrder`);
CREATE INDEX `HomepageSection_bannerId_idx` ON `homepagesection`(`bannerId`);
CREATE INDEX `HomepageSection_collectionId_idx` ON `homepagesection`(`collectionId`);
ALTER TABLE `homepagesection` ADD CONSTRAINT `HomepageSection_bannerId_fkey` FOREIGN KEY (`bannerId`) REFERENCES `banner`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `homepagesection` ADD CONSTRAINT `HomepageSection_collectionId_fkey` FOREIGN KEY (`collectionId`) REFERENCES `collection`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
