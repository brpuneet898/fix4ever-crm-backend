import { getIO } from "../socket.server";

export function emitToUser(
  userId: string,
  event: string,
  payload: unknown,
): void {
  getIO().to(`user_${userId}`).emit(event, payload);
}

export function emitToAdminDashboard(event: string, payload: unknown): void {
  getIO().to("admin_dashboard").emit(event, payload);
}

export function emitToCrmRoom(event: string, payload: unknown): void {
  getIO().to("crm_room").emit(event, payload);
}
