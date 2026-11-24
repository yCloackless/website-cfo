import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import {
  isSidebarGroupId,
  SIDEBAR_GROUP_ORDER,
  type SidebarGroupId,
} from '../utils/sidebarLayout.ts';

export interface SidebarDropTarget {
  groupId: SidebarGroupId;
  index: number;
  itemId?: string;
  position?: 'before' | 'after';
}

export interface UseSidebarDragOptions {
  groups: Record<SidebarGroupId, string[]>;
  onMove: (itemId: string, targetGroupId: SidebarGroupId, targetIndex: number) => void;
  enabled?: boolean;
  activationDistance?: number;
}

export interface DragHandleProps {
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void;
  style: { touchAction: 'none' };
  'data-dnd-handle': string;
}

export interface UseSidebarDragResult {
  draggingId: string | null;
  dropTarget: SidebarDropTarget | null;
  pointerPos: { x: number; y: number } | null;
  onStartDrag: (itemId: string, groupId: SidebarGroupId, e: ReactPointerEvent<HTMLElement>) => void;
  getDragHandleProps: (itemId: string, groupId: SidebarGroupId) => DragHandleProps;
  cancelDrag: () => void;
}

interface PendingDragState {
  itemId: string;
  groupId: SidebarGroupId;
  pointerId: number;
  startX: number;
  startY: number;
  activated: boolean;
}

function findGroupForItem(
  groups: Record<SidebarGroupId, string[]>,
  itemId: string
): SidebarGroupId | null {
  for (const groupId of SIDEBAR_GROUP_ORDER) {
    if (groups[groupId]?.includes(itemId)) {
      return groupId;
    }
  }
  return null;
}

function resolveGroupContainerTarget(
  groupEl: HTMLElement,
  groupId: SidebarGroupId,
  clientY: number,
  groups: Record<SidebarGroupId, string[]>
): SidebarDropTarget {
  const list = groups[groupId] ?? [];
  const itemEls = Array.from(groupEl.querySelectorAll<HTMLElement>('[data-dnd-item-id]'));

  if (itemEls.length === 0) {
    return { groupId, index: 0 };
  }

  const firstEl = itemEls[0];
  const firstRect = firstEl.getBoundingClientRect();
  if (clientY <= firstRect.top) {
    const firstId = firstEl.getAttribute('data-dnd-item-id') ?? undefined;
    const firstIndex = firstId ? list.indexOf(firstId) : -1;
    return {
      groupId,
      index: firstIndex >= 0 ? firstIndex : 0,
      itemId: firstId,
      position: 'before',
    };
  }

  const lastEl = itemEls[itemEls.length - 1];
  const lastRect = lastEl.getBoundingClientRect();
  if (clientY >= lastRect.bottom) {
    const lastId = lastEl.getAttribute('data-dnd-item-id') ?? undefined;
    const lastIndex = lastId ? list.indexOf(lastId) : -1;
    return {
      groupId,
      index: lastIndex >= 0 ? lastIndex + 1 : list.length,
      itemId: lastId,
      position: 'after',
    };
  }

  // Pointer is inside a gap between items: snap to the closest item vertically.
  let closestEl = firstEl;
  let closestDist = Infinity;
  let closestRect = firstRect;

  for (const el of itemEls) {
    const rect = el.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const dist = Math.abs(clientY - midY);
    if (dist < closestDist) {
      closestDist = dist;
      closestEl = el;
      closestRect = rect;
    }
  }

  const closestId = closestEl.getAttribute('data-dnd-item-id') ?? undefined;
  const closestIdx = closestId ? list.indexOf(closestId) : -1;
  if (closestIdx < 0) {
    return { groupId, index: list.length };
  }

  const position: 'before' | 'after' =
    clientY < closestRect.top + closestRect.height / 2 ? 'before' : 'after';

  return {
    groupId,
    index: position === 'before' ? closestIdx : closestIdx + 1,
    itemId: closestId,
    position,
  };
}

function resolveDropTarget(
  clientX: number,
  clientY: number,
  groups: Record<SidebarGroupId, string[]>
): SidebarDropTarget | null {
  if (typeof document === 'undefined' || typeof document.elementFromPoint !== 'function') {
    return null;
  }

  const hit = document.elementFromPoint(clientX, clientY);
  if (!hit) return null;

  const itemEl = hit.closest<HTMLElement>('[data-dnd-item-id]');
  if (itemEl) {
    const itemId = itemEl.getAttribute('data-dnd-item-id');
    if (itemId) {
      const groupEl = itemEl.closest<HTMLElement>('[data-dnd-group-id]');
      const attrGroupId = groupEl?.getAttribute('data-dnd-group-id');
      const groupId = isSidebarGroupId(attrGroupId)
        ? attrGroupId
        : findGroupForItem(groups, itemId);

      if (groupId) {
        const list = groups[groupId] ?? [];
        const itemIndex = list.indexOf(itemId);
        if (itemIndex >= 0) {
          const rect = itemEl.getBoundingClientRect();
          const position: 'before' | 'after' =
            clientY < rect.top + rect.height / 2 ? 'before' : 'after';
          return {
            groupId,
            index: position === 'before' ? itemIndex : itemIndex + 1,
            itemId,
            position,
          };
        }
      }
    }
  }

  const groupEl = hit.closest<HTMLElement>('[data-dnd-group-id]');
  if (groupEl) {
    const attrGroupId = groupEl.getAttribute('data-dnd-group-id');
    if (isSidebarGroupId(attrGroupId)) {
      return resolveGroupContainerTarget(groupEl, attrGroupId, clientY, groups);
    }
  }

  return null;
}

/**
 * Pointer-based cross-group drag-and-drop hook using unified Pointer Events
 * (mouse, trackpad, and touch) with zero external dependencies or timers.
 */
export function useSidebarDrag({
  groups,
  onMove,
  enabled = true,
  activationDistance = 4,
}: UseSidebarDragOptions): UseSidebarDragResult {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<SidebarDropTarget | null>(null);
  const [pointerPos, setPointerPos] = useState<{ x: number; y: number } | null>(null);

  const pendingRef = useRef<PendingDragState | null>(null);
  const dropTargetRef = useRef<SidebarDropTarget | null>(null);
  const cleanupListenersRef = useRef<(() => void) | null>(null);
  const prevUserSelectRef = useRef<string | null>(null);

  const groupsRef = useRef(groups);
  groupsRef.current = groups;

  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  const activationDistanceRef = useRef(activationDistance);
  activationDistanceRef.current = activationDistance;

  const resetDragState = useCallback(() => {
    cleanupListenersRef.current?.();
    cleanupListenersRef.current = null;
    pendingRef.current = null;
    dropTargetRef.current = null;

    if (prevUserSelectRef.current !== null && typeof document !== 'undefined' && document.body) {
      document.body.style.userSelect = prevUserSelectRef.current;
      prevUserSelectRef.current = null;
    }

    setDraggingId(null);
    setDropTarget(null);
    setPointerPos(null);
  }, []);

  const cancelDrag = useCallback(() => {
    resetDragState();
  }, [resetDragState]);

  useEffect(() => {
    if (!enabled && pendingRef.current) {
      resetDragState();
    }
  }, [enabled, resetDragState]);

  useEffect(() => {
    return () => {
      resetDragState();
    };
  }, [resetDragState]);

  const activateDrag = useCallback((pending: PendingDragState, clientX: number, clientY: number) => {
    pending.activated = true;
    if (typeof document !== 'undefined' && document.body && prevUserSelectRef.current === null) {
      prevUserSelectRef.current = document.body.style.userSelect;
      document.body.style.userSelect = 'none';
    }
    setDraggingId(pending.itemId);
    setPointerPos({ x: clientX, y: clientY });

    const initialTarget = resolveDropTarget(clientX, clientY, groupsRef.current);
    dropTargetRef.current = initialTarget;
    setDropTarget(initialTarget);
  }, []);

  const onStartDrag = useCallback(
    (itemId: string, groupId: SidebarGroupId, e: ReactPointerEvent<HTMLElement>) => {
      if (!enabled) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (typeof window === 'undefined') return;

      resetDragState();

      const pending: PendingDragState = {
        itemId,
        groupId,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        activated: false,
      };
      pendingRef.current = pending;

      if (activationDistanceRef.current <= 0) {
        activateDrag(pending, e.clientX, e.clientY);
      }

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const active = pendingRef.current;
        if (!active || moveEvent.pointerId !== active.pointerId) return;

        if (!active.activated) {
          const distance = Math.hypot(
            moveEvent.clientX - active.startX,
            moveEvent.clientY - active.startY
          );
          if (distance < activationDistanceRef.current) return;
          activateDrag(active, moveEvent.clientX, moveEvent.clientY);
          return;
        }

        setPointerPos({ x: moveEvent.clientX, y: moveEvent.clientY });
        const nextTarget = resolveDropTarget(
          moveEvent.clientX,
          moveEvent.clientY,
          groupsRef.current
        );
        dropTargetRef.current = nextTarget;
        setDropTarget(nextTarget);
      };

      const handlePointerUp = (upEvent: PointerEvent) => {
        const active = pendingRef.current;
        if (!active || upEvent.pointerId !== active.pointerId) return;

        const wasActivated = active.activated;
        const draggedItemId = active.itemId;
        const sourceGroupId = active.groupId;
        const target = dropTargetRef.current;

        resetDragState();

        if (!wasActivated || !target) return;

        const sourceIndex = groupsRef.current[sourceGroupId]?.indexOf(draggedItemId) ?? -1;
        const isSameSlot =
          target.groupId === sourceGroupId &&
          sourceIndex >= 0 &&
          (target.index === sourceIndex || target.index === sourceIndex + 1);

        if (!isSameSlot) {
          onMoveRef.current(draggedItemId, target.groupId, target.index);
        }
      };

      const handlePointerCancel = (cancelEvent: PointerEvent) => {
        const active = pendingRef.current;
        if (!active || cancelEvent.pointerId !== active.pointerId) return;
        resetDragState();
      };

      const handleKeyDown = (keyEvent: KeyboardEvent) => {
        if (keyEvent.key === 'Escape') {
          resetDragState();
        }
      };

      const handleWindowBlur = () => {
        resetDragState();
      };

      window.addEventListener('pointermove', handlePointerMove, { passive: true });
      window.addEventListener('pointerup', handlePointerUp);
      window.addEventListener('pointercancel', handlePointerCancel);
      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('blur', handleWindowBlur);

      cleanupListenersRef.current = () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
        window.removeEventListener('pointercancel', handlePointerCancel);
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('blur', handleWindowBlur);
      };
    },
    [activateDrag, enabled, resetDragState]
  );

  const getDragHandleProps = useCallback(
    (itemId: string, groupId: SidebarGroupId): DragHandleProps => ({
      onPointerDown: (e: ReactPointerEvent<HTMLElement>) => onStartDrag(itemId, groupId, e),
      style: { touchAction: 'none' },
      'data-dnd-handle': itemId,
    }),
    [onStartDrag]
  );

  return {
    draggingId,
    dropTarget,
    pointerPos,
    onStartDrag,
    getDragHandleProps,
    cancelDrag,
  };
}
