import Link from 'next/link'

export function NavLink({ href, children }) {
  return (
    <Link
      href={href}
      className="inline-block rounded-lg px-3 py-1.5 text-[15px] text-zinc-700 transition-colors duration-200 hover:bg-zinc-100 hover:text-zinc-900"
    >
      {children}
    </Link>
  )
}
