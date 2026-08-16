"use client";

import { ArrowRight, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { HailLogo } from "@/app/theme-provider";
import AuthButton from "@/components/AuthButton";
import { AUTH_ENABLED } from "@/lib/constants";
import { useSession } from "next-auth/react";

export default function HomePage() {
	const [query, setQuery] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);
	const router = useRouter();
	const { data: session } = useSession();

	const handleSearch = (e: React.FormEvent) => {
		e.preventDefault();
		if (!query.trim()) return;
		router.push(`/search?q=${encodeURIComponent(query.trim())}`);
	};

	const examples = ["Stripe", "Linear", "Notion", "Vercel", "Figma", "Anthropic"];

	return (
		<div
			className="min-h-screen flex flex-col"
			style={{ background: "var(--cream)" }}
		>
			{/* Nav */}
			<nav className="nav fixed top-0 left-0 right-0 z-50">
				<div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
					<HailLogo className="text-lg" />
					<div className="flex items-center gap-3">
						{AUTH_ENABLED && <AuthButton />}
					</div>
				</div>
			</nav>

			<main className="flex-1 flex flex-col items-center pt-32 pb-20 px-6">
				{/* Hero */}
				<div className="text-center mb-10 fade-up">
					<h1 className="text-5xl sm:text-6xl font-semibold text-[var(--brown-3)] mb-4 tracking-tight">
						Reach the right
						<br />
						people at startups.
					</h1>
					<p className="text-[var(--muted)] text-lg max-w-xl mx-auto leading-relaxed">
						Research any startup in seconds. Map their team. Generate outreach
						that actually gets replies.
					</p>
					{!session && AUTH_ENABLED && (
						<p className="text-sm mt-3 text-[var(--muted)]">
							Sign in with Google — <strong>2 free searches per day</strong>.
						</p>
					)}
				</div>

				{/* Search */}
				<form onSubmit={handleSearch} className="w-full max-w-xl fade-up delay-1">
					<div className="surface flex items-center gap-3 px-4 py-3 focus-within:border-[var(--brown-1)] transition-colors">
						<Search className="w-4 h-4 text-[var(--muted)] shrink-0" />
						<input
							ref={inputRef}
							type="text"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
							placeholder="Search a startup…"
							className="flex-1 bg-transparent text-[var(--text)] placeholder-[var(--muted)] outline-none text-[15px]"
							autoFocus
						/>
						<button
							type="submit"
							disabled={!query.trim()}
							className="btn-primary flex items-center gap-2 py-2 px-4 text-sm"
						>
							<span>Search</span>
							<ArrowRight className="w-3.5 h-3.5" />
						</button>
					</div>
				</form>

				{/* Examples */}
				<div className="flex flex-wrap items-center justify-center gap-2 mt-5 fade-up delay-2">
					<span className="text-xs text-[var(--muted)]">Try:</span>
					{examples.map((ex) => (
						<button
							key={ex}
							onClick={() => router.push(`/search?q=${encodeURIComponent(ex)}`)}
							className="text-xs px-3 py-1.5 rounded-full border border-[var(--border)] text-[var(--muted)] hover:border-[var(--brown-1)] hover:text-[var(--brown-2)] transition-all"
						>
							{ex}
						</button>
					))}
				</div>

				{/* Feature strip */}
				<div className="grid grid-cols-3 gap-4 mt-20 max-w-xl w-full fade-up delay-3">
					{[
						{ label: "Discover", desc: "Search any startup" },
						{ label: "Map the Team", desc: "Visual org tree" },
						{ label: "Reach Out", desc: "AI-drafted messages" },
					].map((f) => (
						<div key={f.label} className="surface-2 p-4 text-center">
							<p className="text-sm font-medium text-[var(--brown-3)] mb-1">
								{f.label}
							</p>
							<p className="text-xs text-[var(--muted)]">{f.desc}</p>
						</div>
					))}
				</div>
			</main>
		</div>
	);
}
