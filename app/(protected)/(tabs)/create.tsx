import { View } from "react-native";

import { H1, Muted } from "@/components/ui/typography";

export default function Create() {
	return (
		<View className="flex-1 items-center justify-center bg-background p-4 gap-y-4">
			<H1 className="text-center">Create</H1>
			<Muted className="text-center">
				Create something new here.
			</Muted>
		</View>
	);
}
