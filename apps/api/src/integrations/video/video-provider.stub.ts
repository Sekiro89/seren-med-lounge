import { Injectable, Logger } from '@nestjs/common';
import type { CreateVideoRoomInput, VideoProvider, VideoRoom } from './video-provider.interface';

/** Not production-ready. No video/WebRTC provider is contracted yet. */
@Injectable()
export class StubVideoProvider implements VideoProvider {
  private readonly logger = new Logger(StubVideoProvider.name);

  async createRoom(input: CreateVideoRoomInput): Promise<VideoRoom> {
    this.logger.warn(
      `StubVideoProvider: would create a room for appointment ${input.appointmentId}`,
    );
    const roomId = `stub_${Date.now()}`;
    return {
      roomId,
      patientJoinUrl: `https://example.invalid/room/${roomId}?role=patient`,
      doctorJoinUrl: `https://example.invalid/room/${roomId}?role=doctor`,
    };
  }

  async endRoom(): Promise<void> {
    this.logger.warn('StubVideoProvider: would end the room');
  }
}
