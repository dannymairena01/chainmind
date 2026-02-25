"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useRouter } from "next/navigation";
import { z } from "zod";

type TaskType = "MONITOR" | "SWAP" | "ALERT";

interface NewAgentForm {
    name: string;
    taskType: TaskType;
    description: string;
}

const TASK_OPTIONS: { value: TaskType; label: string; icon: string }[] = [
    { value: "MONITOR", label: "Monitor Wallet", icon: "👁️" },
    { value: "SWAP", label: "Execute Swaps", icon: "🔄" },
    { value: "ALERT", label: "Price Alert", icon: "🔔" },
];

const CreateAgentSchema = z.object({
    name: z.string().min(1, "Agent name is required").max(100, "Name must be 100 chars or less"),
    taskType: z.enum(["SWAP", "MONITOR", "ALERT"]),
    description: z.string().max(500, "Instructions must be 500 chars or less").optional(),
});

type FormErrors = Partial<Record<keyof z.infer<typeof CreateAgentSchema>, string>>;

export default function NewAgentPage() {
    const { user, authenticated, login, getAccessToken } = usePrivy();
    const router = useRouter();
    const [form, setForm] = useState<{ name: string; taskType: TaskType; description: string }>({
        name: "",
        taskType: "MONITOR",
        description: "",
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<FormErrors>({});

    if (!authenticated) {
        return (
            <main className="flex min-h-screen flex-col items-center justify-center">
                <p className="text-gray-400 mb-4">Connect your wallet to create an agent.</p>
                <button
                    onClick={login}
                    className="rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white hover:bg-indigo-500 transition"
                >
                    Connect Wallet
                </button>
            </main>
        );
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user?.wallet?.address) return;

        // Client-side Zod validation before hitting the API
        const parsed = CreateAgentSchema.safeParse(form);
        if (!parsed.success) {
            const errors: FormErrors = {};
            for (const issue of parsed.error.issues) {
                const field = issue.path[0] as keyof FormErrors;
                errors[field] = issue.message;
            }
            setFieldErrors(errors);
            return;
        }
        setFieldErrors({});

        setLoading(true);
        setError(null);

        try {
            const token = await getAccessToken();

            const res = await fetch(
                `${process.env["NEXT_PUBLIC_AGENT_API_URL"] ?? "http://localhost:3001"}/agents`,
                {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify(parsed.data),
                }
            );

            if (!res.ok) {
                const body = await res.json() as { error?: string; errors?: { field: string; message: string }[] };
                const msg = body.errors
                    ? body.errors.map((e) => `${e.field}: ${e.message}`).join(", ")
                    : body.error ?? "Failed to create agent";
                throw new Error(msg);
            }

            const data = (await res.json()) as { agentId: string };
            router.push(`/agents/${data.agentId}`);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setLoading(false);
        }
    };

    return (
        <main className="mx-auto max-w-2xl px-6 py-12">
            <h1 className="text-3xl font-bold text-white mb-2">Create New Agent</h1>
            <p className="text-gray-400 mb-8">
                Configure your autonomous AI agent. It will receive its own on-chain wallet.
            </p>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Agent Name */}
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                        Agent Name
                    </label>
                    <input
                        type="text"
                        value={form.name}
                        onChange={(e) => { setForm({ ...form, name: e.target.value }); setFieldErrors((p) => ({ ...p, name: undefined })); }}
                        placeholder="e.g. Alpha Monitor"
                        className={`w-full rounded-lg border bg-white/5 px-4 py-3 text-white placeholder-gray-600 outline-none focus:ring-1 transition ${fieldErrors.name ? "border-red-500 focus:border-red-500 focus:ring-red-500" : "border-white/10 focus:border-indigo-500 focus:ring-indigo-500"
                            }`}
                    />
                    {fieldErrors.name && <p className="mt-1.5 text-xs text-red-400">{fieldErrors.name}</p>}
                </div>

                {/* Task Type */}
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                        Task Type
                    </label>
                    <div className="grid grid-cols-3 gap-3">
                        {TASK_OPTIONS.map((option) => (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => setForm({ ...form, taskType: option.value })}
                                className={`rounded-xl border p-4 text-center transition ${form.taskType === option.value
                                    ? "border-indigo-500 bg-indigo-500/20 text-indigo-300"
                                    : "border-white/10 bg-white/5 text-gray-400 hover:border-white/20"
                                    }`}
                            >
                                <div className="text-2xl mb-1">{option.icon}</div>
                                <div className="text-sm font-medium">{option.label}</div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Description */}
                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                        Instructions <span className="text-gray-600">(optional)</span>
                    </label>
                    <textarea
                        rows={3}
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        placeholder="Describe what this agent should do..."
                        className="w-full rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-white placeholder-gray-600 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition resize-none"
                    />
                </div>

                {error && (
                    <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
                        {error}
                    </p>
                )}

                <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-lg bg-indigo-600 py-3 font-semibold text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-500 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {loading ? "Deploying Agent…" : "Deploy Agent →"}
                </button>
            </form>
        </main>
    );
}
