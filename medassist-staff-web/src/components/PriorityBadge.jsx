import React from 'react';
import { PRIORITY_META } from '../services/firestoreService';

export default function PriorityBadge({ priority }) {
  const meta = PRIORITY_META[priority];
  if (!meta) return <span className="badge unassessed">Unassessed</span>;
  return <span className={`badge ${meta.cls}`}>{meta.label}</span>;
}
