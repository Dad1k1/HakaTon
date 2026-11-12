'use client';
import { useState } from 'react';
export function Avatar({ person }: { person: { name: string; avatar?: string | null } }) {
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <span className="user-avatar">
      {person.avatar && failed !== person.avatar ? (
        <img src={person.avatar} alt={person.name} onError={() => setFailed(person.avatar!)} />
      ) : (
        <span aria-hidden="true">{person.name.trim().slice(0, 1).toUpperCase()}</span>
      )}
    </span>
  );
}
