"use client";

import NavBar from "./header";

export function PageLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <NavBar />
      <main className="w-full max-w-6xl mx-auto  px-6 lg:px-0 py-10">
        {children}
      </main>
    </>
  );
}
