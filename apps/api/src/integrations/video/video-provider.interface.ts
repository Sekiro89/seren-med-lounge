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
  /** False for the stub: no real calls can be placed, so callers say so instead of handing out a dead link. */
  readonly live: boolean;
  createRoom(input: CreateVideoRoomInput): Promise<VideoRoom>;
  endRoom(roomId: string): Promise<void>;
}
