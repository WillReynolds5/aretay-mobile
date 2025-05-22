import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useRouter } from "expo-router";
import { useForm } from "react-hook-form";
import { ActivityIndicator, View } from "react-native";
import * as z from "zod";

import { Image } from "@/components/image";
import { SafeAreaView } from "@/components/safe-area-view";
import { Button } from "@/components/ui/button";
import { Form, FormField, FormInput } from "@/components/ui/form";
import { Text } from "@/components/ui/text";
import { H1, Muted, P } from "@/components/ui/typography";
import { useAuth } from "@/context/supabase-provider";
import { useColorScheme } from "@/lib/useColorScheme";

const formSchema = z.object({
	email: z.string().email("Please enter a valid email address."),
	password: z
		.string()
		.min(8, "Please enter at least 8 characters.")
		.max(64, "Please enter fewer than 64 characters."),
});

export default function SignIn() {
	const { signIn } = useAuth();
	const router = useRouter();
	const { colorScheme } = useColorScheme();
	const appIcon =
		colorScheme === "dark"
			? require("@/assets/icon.png")
			: require("@/assets/icon-dark.png");

	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			email: "",
			password: "",
		},
	});

	async function onSubmit(data: z.infer<typeof formSchema>) {
		try {
			await signIn(data.email, data.password);
			// router.replace("/(app)/"); // Navigate to a different screen on successful sign-in
			form.reset();
		} catch (error: Error | any) {
			// TODO: Add user-friendly error messages
			console.error(error.message);
		}
	}

	return (
		<SafeAreaView className="flex-1 bg-background p-4" edges={["bottom"]}>
			<View className="flex-1 items-center justify-center web:m-4">
				<Image source={appIcon} className="w-12 h-12 rounded-lg mb-2" />
				<Text className="text-xl font-semibold mb-6">Aretay</Text>

				<H1 className="self-center text-center mb-1">Sign In</H1>
				<Muted className="self-center text-center mb-6">
					Welcome back! Sign in to continue.
				</Muted>

				<Form {...form}>
					<View className="gap-4 w-full max-w-sm">
						<FormField
							control={form.control}
							name="email"
							render={({ field }) => (
								<FormInput
									label="Email"
									placeholder="m@example.com"
									autoCapitalize="none"
									autoComplete="email"
									autoCorrect={false}
									keyboardType="email-address"
									{...field}
								/>
							)}
						/>
						<FormField
							control={form.control}
							name="password"
							render={({ field }) => (
								<FormInput
									label="Password"
									placeholder="Password"
									autoCapitalize="none"
									autoCorrect={false}
									secureTextEntry
									{...field}
								/>
							)}
						/>
					</View>
				</Form>
			</View>
			<View className="gap-y-4 web:m-4 items-center">
				<Button
					size="default"
					variant="default"
					onPress={form.handleSubmit(onSubmit)}
					disabled={form.formState.isSubmitting}
					className="w-full max-w-sm"
				>
					{form.formState.isSubmitting ? (
						<ActivityIndicator size="small" color="white" />
					) : (
						<Text>Sign In</Text>
					)}
				</Button>
				<P className="text-sm text-muted-foreground">
					Don't have an account?{" "}
					<Link href="/sign-up" className="font-semibold text-primary">
						Sign Up
					</Link>
				</P>
			</View>
		</SafeAreaView>
	);
}
