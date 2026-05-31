import { fail, type MaybeError, success } from "@firtoz/maybe-error";
import { CHATROOM_ADMIN_USER_ID_HEADER, CHATROOM_INTERNAL_SECRET_HEADER } from "./contract";

export type ChatroomAdminApiError = {
	message: string;
	status: 400 | 401 | 403 | 404;
};

export type ChatroomAdminDeleteResult = MaybeError<true, ChatroomAdminApiError>;

/** HTTP status for a {@link ChatroomAdminDeleteResult} JSON body. */
export function chatroomAdminDeleteHttpStatus(
	result: ChatroomAdminDeleteResult,
): 200 | ChatroomAdminApiError["status"] {
	return result.success ? 200 : result.error.status;
}

/** Internal admin routes — secret + attested admin user id (set by web worker). */
export function checkChatroomAdminAllowed(
	headers: Headers,
	internalSecret: string,
): ChatroomAdminDeleteResult {
	if (headers.get(CHATROOM_INTERNAL_SECRET_HEADER) !== internalSecret) {
		return fail<ChatroomAdminApiError>({ message: "Unauthorized", status: 401 });
	}
	if (!headers.get(CHATROOM_ADMIN_USER_ID_HEADER)?.trim()) {
		return fail<ChatroomAdminApiError>({ message: "Forbidden", status: 403 });
	}
	return success(true);
}
