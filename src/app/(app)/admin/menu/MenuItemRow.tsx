"use client";

import { useState } from "react";
import SubmitButton from "@/components/SubmitButton";
import { updateMenuItem, toggleMenuItem } from "../actions";

type Item = {
  code: string;
  name: string;
  category: string;
  price: number;
  unit: string;
  isActive: boolean;
};

export default function MenuItemRow({ item, currency }: { item: Item; currency: string }) {
  const [name, setName] = useState(item.name);
  const [category, setCategory] = useState(item.category);
  const [price, setPrice] = useState(item.price);
  const isDirty = name !== item.name || category !== item.category || price !== item.price;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 p-2">
      <form action={updateMenuItem} className="flex flex-1 flex-wrap items-center gap-2">
        <input type="hidden" name="code" value={item.code} />
        <input
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={
            "flex-1 min-w-32 rounded-lg border border-gray-300 px-2 py-1.5 text-sm " +
            (!item.isActive ? "text-gray-400 line-through" : "")
          }
        />
        <input
          name="category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="Category"
          className="w-28 rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-500"
        />
        <input
          name="price"
          type="number"
          min={0}
          value={price}
          onChange={(e) => setPrice(Number(e.target.value))}
          className="w-24 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
        />
        <span className="w-14 text-xs text-gray-400">
          {currency}/{item.unit === "GRAM" ? "gram" : "unit"}
        </span>
        {isDirty && (
          <SubmitButton className="rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-900 disabled:opacity-60">
            Save
          </SubmitButton>
        )}
      </form>
      <form action={toggleMenuItem}>
        <input type="hidden" name="code" value={item.code} />
        <button className="text-xs text-gray-500 hover:underline">
          {item.isActive ? "Hide" : "Show"}
        </button>
      </form>
    </div>
  );
}
