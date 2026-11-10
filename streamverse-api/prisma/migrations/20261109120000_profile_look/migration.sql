-- The customer's chosen colour, and room for their small profile photo (a data URL) in avatarUrl.
ALTER TABLE `User` ADD COLUMN `accentColor` INTEGER NULL,
    MODIFY `avatarUrl` MEDIUMTEXT NULL;
