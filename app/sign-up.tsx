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
	firstName: z.string().min(1, "First name is required."),
	email: z.string().email("Please enter a valid email address."),
	password: z
		.string()
		.min(8, "Please enter at least 8 characters.")
		.max(64, "Please enter fewer than 64 characters.")
		.regex(
			/^(?=.*[a-z])/,
			"Your password must have at least one lowercase letter.",
		)
		.regex(
			/^(?=.*[A-Z])/,
			"Your password must have at least one uppercase letter.",
		)
		.regex(/^(?=.*[0-9])/, "Your password must have at least one number.")
		.regex(
			/^(?=.*[!@#$%^&*])/,
			"Your password must have at least one special character.",
		),
});

export default function SignUp() {
	const { signUp } = useAuth();
	const router = useRouter();
	const { colorScheme } = useColorScheme();
	const appIcon =
		colorScheme === "dark"
			? require("@/assets/icon.png")
			: require("@/assets/icon-dark.png");

	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			firstName: "",
			email: "",
			password: "",
		},
	});

	async function onSubmit(data: z.infer<typeof formSchema>) {
		try {
			// Note: The current signUp function in useAuth might only expect email and password.
			// This will need to be adjusted if firstName needs to be sent to the backend.
			await signUp(data.email, data.password);
			// router.replace("/(app)/"); // Navigate to a different screen on successful sign-up
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

				<H1 className="self-center text-center mb-1">Create an account</H1>
				<Muted className="self-center text-center mb-6">
					Enter your details below to create your account
				</Muted>

				{/* TODO: Implement Google Sign Up Button here if needed */}
				{/* <Button variant="outline" className="mb-4 w-full">
					<Text>Sign up with Google</Text>
				</Button> */}

				<View className="flex-row items-center my-4 w-full max-w-sm">
					<View className="flex-1 h-px bg-muted" />
					<Text className="mx-4 text-muted-foreground">
						Or continue with email
					</Text>
					<View className="flex-1 h-px bg-muted" />
				</View>

				<Form {...form}>
					<View className="gap-4 w-full max-w-sm">
						<FormField
							control={form.control}
							name="firstName"
							render={({ field }) => (
								<FormInput
									label="First Name"
									placeholder="John"
									autoCapitalize="words"
									autoComplete="name"
									autoCorrect={false}
									{...field}
								/>
							)}
						/>
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
						<ActivityIndicator size="small" color="white"/>
					) : (
						<Text>Sign Up</Text>
					)}
				</Button>
				<P className="text-sm text-muted-foreground">
					Already have an account?{" "}
					<Link href="/sign-in" className="font-semibold text-primary">
						Login
					</Link>
				</P>
			</View>
		</SafeAreaView>
	);
}
