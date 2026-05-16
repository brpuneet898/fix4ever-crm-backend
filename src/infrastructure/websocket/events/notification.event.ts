/**
 * Notification Sync Events
 * Real-time push of notifications to connected users
 */
import {
  emitToUser,
  emitToAdminDashboard,
  emitToCrmRoom,
} from "./analytics.event";

export function pushNotificationToUser(
  userId: string,
  notification: {
    title: string;
    message: string;
    type: string;
    relatedId?: string;
  },
) {
  emitToUser(userId, "notification:new", notification);
}

export function pushTicketUpdateToAdmin(ticketData: {
  ticketId: string;
  status: string;
  priority: string;
  title: string;
}) {
  emitToAdminDashboard("ticket:created", ticketData);
  emitToCrmRoom("ticket:created", ticketData);
}
