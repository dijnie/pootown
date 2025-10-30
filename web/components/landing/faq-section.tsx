"use client"

import { useState } from "react"
import AnimatedGridBackground from "./animated-grid-background"

export default function FAQSection() {
    const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null)

    const faqs = [
        {
            q: "How much does it cost to play?",
            a: "Currently FREE on devnet! Mainnet will have minimal SOL fees for transactions.",
            color: "#ff0080",
        },
        {
            q: "Do I need crypto experience?",
            a: "No! Just connect a Solana wallet and start playing. We'll guide you through everything.",
            color: "#9945ff",
        },
        {
            q: "Can I play with friends?",
            a: "Yes! Create private games or join public tournaments with players worldwide.",
            color: "#14f195",
        },
        {
            q: "What happens to my NFT properties?",
            a: "You own them! Trade, sell, or hold your properties as real NFTs on Solana.",
            color: "#ffed00",
        },
        {
            q: "Is this official Monopoly?",
            a: "This is an independent blockchain game inspired by classic board game mechanics.",
            color: "#ff0080",
        },
    ]

    return (
        <section id="faq" className="relative py-24 md:py-36 px-6 md:px-12 lg:px-20 bg-[#fffef0]/90 border-t-8 border-black scroll-mt-20">
            <AnimatedGridBackground />
            <div className="max-w-6xl mx-auto relative z-10">
                <h2 className="text-5xl md:text-7xl lg:text-8xl font-black uppercase mb-20 text-center text-black [text-shadow:10px_10px_0_#ffed00] hover:[text-shadow:14px_14px_0_#ffed00] transition-all duration-300">
                    FAQ
                </h2>

                <div className="space-y-8">
                    {faqs.map((faq, i) => {
                        const isOpen = openFaqIndex === i
                        return (
                            <div
                                key={i}
                                onClick={() => setOpenFaqIndex(isOpen ? null : i)}
                                className="border-6 border-black shadow-[10px_10px_0_#000] hover:shadow-[16px_16px_0_#000] hover:-translate-y-2 hover:rotate-1 transition-all duration-500 cursor-pointer group relative overflow-hidden"
                                style={{ backgroundColor: faq.color }}
                            >
                                <div className="absolute inset-0 bg-white opacity-0 group-hover:opacity-20 transition-opacity duration-300" />
                                <div className="p-8 md:p-10 flex justify-between items-center gap-4">
                                    <h3 className="text-2xl md:text-3xl font-black uppercase text-white [text-shadow:2px_2px_0_#000] relative z-10">
                                        {faq.q}
                                    </h3>
                                    <div
                                        className={`text-4xl font-black text-white transition-transform duration-300 ${isOpen ? "rotate-45" : "rotate-0"}`}
                                    >
                                        +
                                    </div>
                                </div>
                                <div
                                    className={`overflow-hidden transition-all duration-500 ${isOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0"}`}
                                >
                                    <p className="text-xl md:text-2xl font-bold text-white [text-shadow:1px_1px_0_#000] relative z-10 px-8 md:px-10 pb-8 md:pb-10">
                                        {faq.a}
                                    </p>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </section>
    )
}
