"use client";
import Link from "next/link";
export default function ErrorPage({reset}:{reset:()=>void}){return <main><h1>Не удалось загрузить заказы</h1><p role="alert">Попробуйте ещё раз. Сохранённые заказы не изменены.</p><button onClick={reset}>Повторить загрузку</button><Link href="/orders">К списку заказов</Link></main>;}
