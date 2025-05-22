import React, { useState, useEffect, useCallback } from "react";
import { View, FlatList, Image, TouchableOpacity, ActivityIndicator, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { MaterialCommunityIcons, Feather } from "@expo/vector-icons";
import { router } from "expo-router";

import { H1, Muted, P, Small } from "@/components/ui/typography";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/config/supabase";

interface Course {
	id: string;
	name: string;
	thumbnail_url?: string;
	tags: string[];
	is_public?: boolean;
	created_by?: string;
	status?: string;
}

export default function Home() {
	const [user, setUser] = useState<any>(null);
	const [courses, setCourses] = useState<Course[]>([]);
	const [inProgressBooks, setInProgressBooks] = useState<Course[]>([]);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedTag, setSelectedTag] = useState<string | null>(null);
	const [tags, setTags] = useState<string[]>([]);

	const fetchData = useCallback(async (isRefresh = false) => {
		try {
			if (isRefresh) {
				setRefreshing(true);
			} else {
				setLoading(true);
			}
			
			// Get user data
			const { data: { user }, error: authError } = await supabase.auth.getUser();
			
			if (authError) {
				console.error("Auth error:", authError);
				setUser(null);
			} else {
				setUser(user);
			}

			// Fetch courses
			const query = supabase
				.from("books")
				.select(`
					id,
					name,
					image_url,
					is_public,
					created_by,
					status,
					book_tags (
						tags (
							name
						)
					)
				`)
				.eq("is_active", true)
				.eq("status", "completed");

			if (user?.id) {
				query.or(`is_public.eq.true,created_by.eq.${user.id}`);
			} else {
				query.eq("is_public", true);
			}

			const { data: booksData, error: booksError } = await query.order("created_at", { ascending: false });

			if (booksError) {
				console.error("Error fetching books:", booksError);
				throw booksError;
			}

			if (!booksData || booksData.length === 0) {
				console.log("No books found");
				setCourses([]);
				setTags([]);
				return;
			}

			const transformedBooks = booksData.map(book => ({
				id: book.id,
				name: book.name,
				thumbnail_url: book.image_url,
				tags: book.book_tags?.map((bt: any) => bt.tags.name) || [],
				is_public: book.is_public,
				created_by: book.created_by
			}));

			const uniqueTags = Array.from(new Set(
				booksData.flatMap(book => 
					book.book_tags?.map((bt: any) => bt.tags.name) || []
				)
			));
			setTags(uniqueTags);
			setCourses(transformedBooks);

			// If user is logged in, fetch their in-progress books
			if (user?.id) {
				const { data: inProgressData, error: inProgressError } = await supabase
					.from("books")
					.select(`
						id,
						name,
						image_url,
						created_by,
						status,
						is_public,
						book_tags (
							tags (
								name
							)
						)
					`)
					.eq("created_by", user.id)
					.eq("status", "in_progress")
					.order("created_at", { ascending: false });

				if (inProgressError) {
					console.error("Error fetching in-progress books:", inProgressError);
				} else if (inProgressData && inProgressData.length > 0) {
					const transformedInProgress = inProgressData.map(book => ({
						id: book.id,
						name: book.name,
						thumbnail_url: book.image_url,
						tags: book.book_tags?.map((bt: any) => bt.tags.name) || [],
						is_public: book.is_public,
						created_by: book.created_by,
						status: "in_progress"
					}));
					setInProgressBooks(transformedInProgress);
				} else {
					setInProgressBooks([]);
				}
			}
		} catch (error) {
			console.error("Error in initialization:", error);
			setCourses([]);
			setTags([]);
		} finally {
			setLoading(false);
			setRefreshing(false);
		}
	}, []);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	const handlePublicToggle = async (courseId: string, isPublic: boolean) => {
		try {
			if (!user) return;

			const { error } = await supabase
				.from("books")
				.update({ is_public: !isPublic })
				.eq("id", courseId)
				.eq("created_by", user.id);
			
			if (error) {
				console.error("Error updating book public status:", error);
				return;
			}

			// Update local state
			setCourses(prev => prev.map(course => 
				course.id === courseId ? { ...course, is_public: !isPublic } : course
			));
			
			setInProgressBooks(prev => prev.map(course => 
				course.id === courseId ? { ...course, is_public: !isPublic } : course
			));
		} catch (error) {
			console.error("Error toggling public status:", error);
		}
	};

	// Filter courses based on search query and selected tag
	const filteredCourses = courses.filter(course => {
		const matchesSearch = course.name.toLowerCase().includes(searchQuery.toLowerCase());
		const matchesTag = !selectedTag || course.tags.includes(selectedTag);
		return matchesSearch && matchesTag;
	});

	// Filter in-progress books similarly
	const filteredInProgress = inProgressBooks.filter(book => {
		const matchesSearch = book.name.toLowerCase().includes(searchQuery.toLowerCase());
		const matchesTag = !selectedTag || book.tags.includes(selectedTag);
		return matchesSearch && matchesTag;
	});

	// Combine regular and in-progress books for display
	const allFilteredCourses = [...filteredCourses, ...filteredInProgress];

	const getTagIcon = (tag: string) => {
		const iconMap: { [key: string]: keyof typeof MaterialCommunityIcons.glyphMap } = {
			'programming': 'code-array',
			'business': 'briefcase',
			'art': 'palette',
			'music': 'music',
			'science': 'flask',
			'math': 'calculator',
			'languages': 'translate',
			'health': 'heart',
			'fitness': 'weight-lifter',
			'education': 'book',
			'technology': 'chip',
			'history': 'clock',
			'biography': 'account-group',
		};
		return iconMap[tag.toLowerCase()] || 'book';
	};

	const handleBookPress = async (bookId: string) => {
		const { data: { user } } = await supabase.auth.getUser();
		const userId = user?.id;
		router.push(`/book/${bookId}?userId=${userId || ''}`);
	};

	const renderCourseItem = ({ item }: { item: Course }) => (
		<TouchableOpacity 
			style={{ 
				flex: 1, 
				margin: 8,
				borderRadius: 12,
				backgroundColor: 'rgba(255, 255, 255, 0.05)',
				overflow: 'hidden',
				borderWidth: 1,
				borderColor: 'rgba(255, 255, 255, 0.1)',
			}}
			onPress={() => handleBookPress(item.id)}
		>
			<View style={{ aspectRatio: 4/3 }}>
				{item.thumbnail_url ? (
					<Image 
						source={{ uri: item.thumbnail_url }} 
						style={{ width: '100%', height: '100%' }}
						resizeMode="cover"
					/>
				) : (
					<View style={{ 
						width: '100%', 
						height: '100%', 
						justifyContent: 'center', 
						alignItems: 'center',
						backgroundColor: 'rgba(255, 255, 255, 0.05)'
					}}>
						<MaterialCommunityIcons name="book" size={32} color="rgba(255, 255, 255, 0.2)" />
					</View>
				)}
				
				{item.status === 'in_progress' && (
					<View style={{
						position: 'absolute',
						top: 0,
						left: 0,
						right: 0,
						bottom: 0,
						backgroundColor: 'rgba(0, 0, 0, 0.5)',
						justifyContent: 'center',
						alignItems: 'center'
					}}>
						<ActivityIndicator color="#fff" size="large" />
						<P className="text-white text-center mt-2">Generating...</P>
					</View>
				)}
			</View>
			
			<View style={{ padding: 16 }}>
				<P className="font-medium mb-2">{item.name}</P>
				
				<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
					{item.tags.slice(0, 2).map((tag, idx) => (
						<View key={idx} style={{ 
							flexDirection: 'row', 
							alignItems: 'center',
							backgroundColor: 'rgba(255, 255, 255, 0.05)',
							paddingHorizontal: 8,
							paddingVertical: 4,
							borderRadius: 999,
						}}>
							<MaterialCommunityIcons 
								name={getTagIcon(tag) as keyof typeof MaterialCommunityIcons.glyphMap} 
								size={12} 
								color="rgba(255, 255, 255, 0.5)" 
								style={{ marginRight: 4 }}
							/>
							<Small className="text-muted-foreground">{tag}</Small>
						</View>
					))}
					{item.tags.length > 2 && (
						<Small className="text-muted-foreground ml-1">+{item.tags.length - 2} more</Small>
					)}
				</View>
				
				{user && item.created_by === user.id && (
					<View style={{ 
						marginTop: 12,
						paddingTop: 12,
						borderTopWidth: 1,
						borderTopColor: 'rgba(255, 255, 255, 0.1)',
						flexDirection: 'row',
						alignItems: 'center'
					}}>
						<Switch 
							checked={!!item.is_public}
							onCheckedChange={() => handlePublicToggle(item.id, !!item.is_public)}
						/>
						<View style={{ flexDirection: 'row', marginLeft: 8, alignItems: 'center' }}>
							<Feather 
								name={item.is_public ? "eye" : "eye-off"} 
								size={12} 
								color="rgba(255, 255, 255, 0.5)" 
								style={{ marginRight: 4 }}
							/>
							<Small className="text-muted-foreground">
								{item.is_public ? 'Public' : 'Private'}
							</Small>
						</View>
					</View>
				)}
			</View>
		</TouchableOpacity>
	);

	return (
		<SafeAreaView className="flex-1 bg-background">
			<ScrollView>
				<View className="px-4 pt-8 pb-8">
					<View className="mb-8">
						<H1 className="text-center">
							Learn Anything,{'\n'}Become Extraordinary
						</H1>
						<Muted className="text-center mt-2">
							Explore our curated courses or create your own.
						</Muted>
					</View>

					{!user && (
						<View style={{ 
							flexDirection: 'row', 
							justifyContent: 'center', 
							gap: 16,
							marginTop: 24,
							marginBottom: 24
						}}>
							<Button 
								variant="outline" 
								size="lg" 
								className="rounded-xl" 
								onPress={() => router.navigate('/sign-in')}
							>
								<P>Login</P>
							</Button>
							<Button 
								size="lg" 
								className="rounded-xl" 
								onPress={() => router.navigate('/sign-up')}
							>
								<P>Sign Up</P>
							</Button>
						</View>
					)}

					{user && (
						<View className="mb-6">
							<View className="flex-row items-center justify-center mb-5">
								<View style={{ flex: 1, position: 'relative' }}>
									<Input
										placeholder="Search courses..."
										value={searchQuery}
										onChangeText={setSearchQuery}
										className="pl-10 pr-4 rounded-xl"
									/>
									<Feather 
										name="search" 
										size={18} 
										style={{ 
											position: 'absolute', 
											left: 12, 
											top: '50%', 
											transform: [{ translateY: -9 }],
											color: 'rgba(255, 255, 255, 0.5)'
										}} 
									/>
									{searchQuery ? (
										<TouchableOpacity 
											onPress={() => setSearchQuery('')}
											style={{ 
												position: 'absolute', 
												right: 12, 
												top: '50%', 
												transform: [{ translateY: -9 }]
											}}
										>
											<Feather name="x" size={18} color="rgba(255, 255, 255, 0.5)" />
										</TouchableOpacity>
									) : null}
								</View>
							</View>

							<ScrollView 
								horizontal 
								showsHorizontalScrollIndicator={false} 
								contentContainerStyle={{ paddingHorizontal: 8, gap: 8 }}
								className="mb-4"
							>
								{tags.map((tag) => (
									<TouchableOpacity
										key={tag}
										onPress={() => setSelectedTag(tag === selectedTag ? null : tag)}
										style={{
											paddingHorizontal: 12,
											paddingVertical: 8,
											borderRadius: 999,
											backgroundColor: selectedTag === tag ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
											borderWidth: 1,
											borderColor: selectedTag === tag ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.1)',
											flexDirection: 'row',
											alignItems: 'center'
										}}
									>
										<MaterialCommunityIcons 
											name={getTagIcon(tag) as keyof typeof MaterialCommunityIcons.glyphMap} 
											size={16} 
											color="rgba(255, 255, 255, 0.5)" 
											style={{ marginRight: 8 }}
										/>
										<Small className={selectedTag === tag ? "text-primary" : "text-muted-foreground"}>
											{tag}
										</Small>
									</TouchableOpacity>
								))}
							</ScrollView>

							{selectedTag && (
								<View style={{ alignItems: 'center', marginTop: 8, marginBottom: 12 }}>
									<View style={{ 
										flexDirection: 'row', 
										alignItems: 'center',
										backgroundColor: 'rgba(255, 255, 255, 0.05)',
										paddingHorizontal: 12,
										paddingVertical: 6,
										borderRadius: 999,
										borderWidth: 1,
										borderColor: 'rgba(255, 255, 255, 0.1)',
									}}>
										<Small>Filtered by: <Small className="text-primary">{selectedTag}</Small></Small>
										<TouchableOpacity 
											onPress={() => setSelectedTag(null)}
											style={{ marginLeft: 8 }}
										>
											<Feather name="x" size={14} color="rgba(255, 255, 255, 0.5)" />
										</TouchableOpacity>
									</View>
								</View>
							)}
						</View>
					)}

					{loading ? (
						<View style={{ padding: 40, alignItems: 'center' }}>
							<ActivityIndicator size="large" color="#fff" />
						</View>
					) : (
						<>
							{allFilteredCourses.length > 0 ? (
								<FlatList
									data={allFilteredCourses}
									renderItem={renderCourseItem}
									keyExtractor={(item) => item.id}
									numColumns={2}
									scrollEnabled={false}
									contentContainerStyle={{ paddingBottom: 20 }}
								/>
							) : (
								<View style={{ padding: 40, alignItems: 'center' }}>
									<Muted className="text-center mb-4">
										{selectedTag 
											? 'No courses found for this tag.'
											: searchQuery
												? 'No courses match your search.'
												: 'No courses available yet.'
										}
									</Muted>
									{(selectedTag || searchQuery) && (
										<Button
											variant="link"
											onPress={() => {
												setSelectedTag(null);
												setSearchQuery('');
											}}
										>
											<P>Clear filters</P>
										</Button>
									)}
								</View>
							)}
						</>
					)}
				</View>
			</ScrollView>
		</SafeAreaView>
	);
}
