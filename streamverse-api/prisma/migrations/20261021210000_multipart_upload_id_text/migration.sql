-- R2/S3 multipart upload ids are longer than 191 characters; every upload over 100 MB failed with a 500 because they did not fit.
ALTER TABLE `MultipartUpload` MODIFY `providerUploadId` TEXT NOT NULL;
