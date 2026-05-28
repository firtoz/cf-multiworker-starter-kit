import { adjectives, animals, uniqueNamesGenerator } from "unique-names-generator";

/** Random adjective–animal label for anonymous chat guests (e.g. `Careless-Ocelot`). */
export function generateAnonymousGuestName(): string {
	return uniqueNamesGenerator({
		dictionaries: [adjectives, animals],
		separator: "-",
		style: "capital",
		length: 2,
	});
}
