-- A banner decides for itself whether and where it appears on the customer homepage.
-- homepageAfter: NULL = at the bottom, 'top' = above every section, otherwise the key of the homepage section it follows.
ALTER TABLE `banner`
  ADD COLUMN `showOnHomepage` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `homepageAfter` VARCHAR(100) NULL;
