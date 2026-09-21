export const VIDEO_PROVIDER = Symbol('VIDEO_PROVIDER');

export interface CreateVideoRoomInput {
  appointmentId: string;
  expiresInMinutes: number;
}

export interface VideoRoom {
  roomId: string;
  patientJoinUrl: string;
  doctorJoinUrl: string;
}

/**
 * Port for the video-consultation provider (e.g. a WebRTC/Twilio-style
 * room API). `appointments`/`encounters` depend only on this interface.
 * See docs/workflows/clinic-journey.md for where video entry fits.
 */
export interface VideoProvider {
  createRoom(input: CreateVideoRoomInput): Promise<VideoRoom>;
  endRoom(roomId: string): Promise<void>;
}
