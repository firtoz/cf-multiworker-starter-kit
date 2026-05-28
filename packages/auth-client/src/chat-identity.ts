import { type ChatAttestedIdentity, resolveChatAttestedIdentity } from "@internal/chat-contract";
import { accountDisplayName } from "./display-name";
import { getSession } from "./session";

/**
 * Resolve chat presence by calling the auth worker service binding (`getSession`).
 * Display name comes from the AUTH profile (anonymous guests get a generated name from Better Auth).
 */
export async function resolveChatIdentityFromAuth(
	auth: Fetcher,
	request: Request,
): Promise<ChatAttestedIdentity | null> {
	const session = await getSession(auth, request);
	if (!session) {
		return null;
	}

	return resolveChatAttestedIdentity({
		userId: session.user.id,
		profileDisplayName: accountDisplayName(session.user),
		isAnonymous: session.user.isAnonymous === true,
	});
}
