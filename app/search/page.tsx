import { Suspense } from "react";
import SearchPage from "./SearchPage";

export default function SearchRoute() {
	return (
		<Suspense>
			<SearchPage />
		</Suspense>
	);
}
