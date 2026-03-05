export function Logo({ className, ...props }) {
  return (
    <img
      src="/maple-favicon.svg"
      alt="Mayple"
      className={className}
      {...props}
    />
  )
}
