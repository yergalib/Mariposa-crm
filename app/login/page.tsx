import { redirect } from "next/navigation";
import { LoginForm } from "./LoginForm";
import { getCurrentSession } from "@/lib/auth/session";

export default async function Login() {
  if (await getCurrentSession()) redirect("/");

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="login-logo">M</div>
        <h1>MARIPOSA CRM</h1>
        <p>Внутренняя система управления</p>
        <LoginForm />
        <small>Доступ только для сотрудников организации.</small>
      </section>
    </main>
  );
}
