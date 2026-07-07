import { Suspense } from "react";
import { ResetPasswordForm } from "./reset-password-form";

/* useSearchParams (reading the emailed link's ?token=) requires a Suspense
 * boundary in the app router — this file stays a server component so that
 * boundary can wrap the client form below it. */
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
