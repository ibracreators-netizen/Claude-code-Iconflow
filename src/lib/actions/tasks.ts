"use server";
import { revalidatePath } from "next/cache";
import { getStoreFor } from "@/lib/auth/session";
import { run } from "@/lib/actions/result";
import type { Task, TaskStatus } from "@/lib/data/types";
import type { Patch } from "@/lib/data/store";

function revalidate() { revalidatePath("/studio/taches"); revalidatePath("/studio"); revalidatePath("/studio/inbox"); }

export async function createTask(input: Pick<Task, "title"> & Partial<Pick<Task, "description" | "priority" | "assignee_id" | "client_id" | "brief_id" | "livrable_id" | "due_date" | "labels" | "status">>) {
  return run(async () => {
    const store = await getStoreFor("taches");
    if (!input.title.trim()) throw new Error("Donne un titre à la tâche.");
    const t = await store.createTask(input);
    revalidate();
    return t;
  });
}

export async function updateTask(id: string, patch: Patch<Task>) {
  return run(async () => { const store = await getStoreFor("taches"); const t = await store.updateTask(id, patch); revalidate(); return t; });
}

export async function moveTask(id: string, status: TaskStatus, position: number) {
  return run(async () => { const store = await getStoreFor("taches"); const t = await store.moveTask(id, status, position); revalidate(); return t; });
}

export async function deleteTask(id: string) {
  return run(async () => { const store = await getStoreFor("taches"); await store.deleteTask(id); revalidate(); });
}
