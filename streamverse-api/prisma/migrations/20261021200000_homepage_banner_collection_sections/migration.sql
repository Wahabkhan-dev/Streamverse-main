-- Homepage sections can be a Banner (picked from the Banner library) or a Collection; position is the section's displayOrder.
ALTER TABLE `HomepageSection`
  ADD COLUMN `bannerId` VARCHAR(191) NULL,
  ADD COLUMN `collectionId` VARCHAR(191) NULL;
CREATE INDEX `HomepageSection_displayOrder_idx` ON `HomepageSection`(`displayOrder`);
CREATE INDEX `HomepageSection_bannerId_idx` ON `HomepageSection`(`bannerId`);
CREATE INDEX `HomepageSection_collectionId_idx` ON `HomepageSection`(`collectionId`);
ALTER TABLE `HomepageSection` ADD CONSTRAINT `HomepageSection_bannerId_fkey` FOREIGN KEY (`bannerId`) REFERENCES `Banner`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `HomepageSection` ADD CONSTRAINT `HomepageSection_collectionId_fkey` FOREIGN KEY (`collectionId`) REFERENCES `Collection`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
