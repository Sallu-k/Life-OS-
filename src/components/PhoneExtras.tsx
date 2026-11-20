"use client";

import { useEffect } from "react";
import { listenForActions } from "@/lib/notificationActions";

// Phone app only: listens for the Done/Snooze buttons on reminders, on every page.
export function PhoneExtras() {
  useEffect(() => listenForActions(), []);
  return null;
}
