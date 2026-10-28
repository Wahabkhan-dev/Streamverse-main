import { audiobookAccess, ebookAccess, movieAccess, withLocalCopy } from "@/lib/offline/shim";
import { api } from "./client";
import type { ApiResponse, ApiPlaybackAccess, ApiMoviePlaybackAccess, ApiEbookAccess, ApiOfflineAuthorization } from "./types";

export const mediaApi = {
  /** POST /media/movies/:id/playback — get signed streaming URL */
  getMoviePlayback(movieId: string) {
    return withLocalCopy(movieId, () => api.post<ApiResponse<ApiMoviePlaybackAccess>>(`/media/movies/${movieId}/playback`), movieAccess);
  },

  /** POST /media/movies/:id/trailer - signed URL of the trailer or teaser (404 when the admin added none) */
  getMovieTrailer(movieId: string, variant: "trailer" | "teaser") {
    return api.post<ApiResponse<{ variant: string; url: string; expiresAt: string }>>(`/media/movies/${movieId}/trailer`, { variant });
  },

  /** POST /media/audiobooks/:id/playback — get signed audio stream URL */
  getAudiobookPlayback(audiobookId: string) {
    return withLocalCopy(audiobookId, () => api.post<ApiResponse<ApiPlaybackAccess>>(`/media/audiobooks/${audiobookId}/playback`), audiobookAccess);
  },

  /** POST /media/offline/:id/authorize: entitlement check + the files of an offline copy */
  authorizeOffline(contentId: string) {
    return api.post<ApiResponse<ApiOfflineAuthorization>>(`/media/offline/${contentId}/authorize`);
  },

  /** POST /media/offline/:id/renew: still entitled? then the copy is good for another stretch */
  renewOffline(contentId: string) {
    return api.post<ApiResponse<{ entitled: boolean; expiresAt: string | null }>>(`/media/offline/${contentId}/renew`);
  },

  /** POST /media/ebooks/:id/access — get signed ebook access URL */
  getEbookAccess(ebookId: string) {
    return withLocalCopy(ebookId, () => api.post<ApiResponse<ApiEbookAccess>>(`/media/ebooks/${ebookId}/access`), ebookAccess);
  },

  /** POST /media/ebooks/:id/access with format "pdf": the PDF a flipbook is built from (needs the connection; no offline copy) */
  getFlipbookAccess(ebookId: string) {
    return api.post<ApiResponse<ApiEbookAccess>>(`/media/ebooks/${ebookId}/access`, { format: "pdf" });
  },
};
