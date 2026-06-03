import { Form, href } from "react-router";

type LogoutFormProps = {
	className?: string;
};

export function LogoutForm({ className }: LogoutFormProps) {
	return (
		<Form method="post" action={href("/logout")} className={className}>
			<button type="submit" className="underline hover:no-underline">
				Log out
			</button>
		</Form>
	);
}
