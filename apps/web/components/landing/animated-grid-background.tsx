export default function AnimatedGridBackground() {
    return (
        <div className="absolute inset-0 overflow-hidden opacity-20 pointer-events-none">
            <div className="grid grid-cols-12 grid-rows-12 h-full">
                {[...Array(144)].map((_, i) => (
                    <div
                        key={i}
                        className="border border-black/20 transition-all duration-700"
                        style={{
                            backgroundColor:
                                i % 7 === 0
                                    ? "#ff008015"
                                    : i % 7 === 1
                                        ? "#9945ff15"
                                        : i % 7 === 2
                                            ? "#14f19515"
                                            : i % 7 === 3
                                                ? "#ffed0015"
                                                : "transparent",
                        }}
                    />
                ))}
            </div>
        </div>
    )
}
