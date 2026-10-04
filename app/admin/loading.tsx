export default function Loading() {
  return (
    <div className="mt-6 space-y-6" aria-busy="true" aria-label="Собираю цифры">
      <div className="h-8 w-48 rounded-lg bg-brand-soft-2 motion-safe:animate-pulse" />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 lg:gap-4">
        <div className="col-span-2 lg:row-span-2 h-40 lg:h-[264px] rounded-2xl bg-brand-soft-2 motion-safe:animate-pulse" />
        {[0, 1, 2, 3, 4].map(i => <div key={i} className="h-[124px] rounded-2xl bg-brand-soft-2 motion-safe:animate-pulse" />)}
      </div>
      <div className="h-64 rounded-2xl bg-brand-soft-2 motion-safe:animate-pulse" />
    </div>
  )
}
