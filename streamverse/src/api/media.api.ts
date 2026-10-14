import { api } from "./client";
import type { ApiResponse, ApiPlaybackAccess, ApiEbookAccess } from "./types";

export const mediaApi = {
  /** POST /media/movies/:id/playback — get signed streaming URL */
  getMoviePlayback(movieId: string) {
    return api.post<ApiResponse<ApiPlaybackAccess>>(`/media/movies/${movieId}/playback`);
  },

  /** POST /media/audiobooks/:id/playback — get signed audio stream URL */
  getAudiobookPlayback(audiobookId: string) {
    return api.post<ApiResponse<ApiPlaybackAccess>>(`/media/audiobooks/${audiobookId}/playback`);
  },

  /** POST /media/ebooks/:id/access — get signed ebook access URL */
  getEbookAccess(ebookId: string) {
    return api.post<ApiResponse<ApiEbookAccess>>(`/media/ebooks/${ebookId}/access`);
  },
};
