/** Workflow actions on a maintenance request, shared by the staff and tenant screens. */
import React, { useState } from 'react';
import { View } from 'react-native';
import { Star } from 'lucide-react-native';
import { colors } from '../theme';
import type { MaintenanceRequest } from '../types';
import type { PickedFile } from '../lib/files';
import type { Transition } from '../lib/workflow';
import { useStore } from '../store/AppContext';
import { PhotoPicker } from './files';
import { Button, Dialog, Input, Notice, Row, T, Touch, useToast } from './ui';

export const TRANSITION_LABEL: Record<Transition, string> = {
  start: 'Start work', complete: 'Mark as fixed', confirm: 'Yes, it’s fixed', dispute: 'No, it’s still a problem',
  reopen: 'Send back to repairer', cancel: 'Cancel request', close: 'Close request',
};

const COPY: Record<Transition, { title: string; body: string; done: string; noteLabel?: string; noteRequired?: boolean }> = {
  start: { title: 'Start work', body: 'The tenant is told that work has started.', done: 'Work started' },
  complete: { title: 'Mark as fixed', body: 'The tenant is asked to confirm the fix or tell you it’s still a problem.', done: 'Marked as fixed — waiting for the tenant', noteLabel: 'What was done' },
  confirm: { title: 'Confirm the fix', body: 'This closes the request.', done: 'Thanks for confirming!' },
  dispute: { title: 'Still a problem?', body: 'Your manager is told straight away and the request is reopened.', done: 'We’ve told your manager', noteLabel: 'What’s still wrong', noteRequired: true },
  reopen: { title: 'Send back to the repairer', body: 'The request returns to In progress and the tenant is told.', done: 'Request reopened', noteLabel: 'Instructions' },
  cancel: { title: 'Cancel request', body: 'Cancelled requests can’t be reopened. Report a new issue if it comes back.', done: 'Request cancelled', noteLabel: 'Reason' },
  close: { title: 'Close without the tenant’s confirmation', body: 'Use this when the tenant can’t be reached. They’re told the request was closed and why.', done: 'Request closed', noteLabel: 'Reason', noteRequired: true },
};

/**
 * Confirms a workflow step and collects what it needs: a note, a rating, or completion photos.
 * `requirePhotos`: a caretaker must show the finished work before marking a job fixed.
 */
export function TransitionDialog({ request, transition, onClose, requirePhotos, actorIsTenant }: {
  request: MaintenanceRequest; transition: Transition | null; onClose: () => void; requirePhotos?: boolean; actorIsTenant?: boolean;
}) {
  return transition ? <TransitionForm key={transition} request={request} transition={transition} onClose={onClose} requirePhotos={requirePhotos} actorIsTenant={actorIsTenant} /> : null;
}

function TransitionForm({ request, transition, onClose, requirePhotos, actorIsTenant }: {
  request: MaintenanceRequest; transition: Transition; onClose: () => void; requirePhotos?: boolean; actorIsTenant?: boolean;
}) {
  const { transitionRequest } = useStore();
  const toast = useToast();
  const [note, setNote] = useState('');
  const [rating, setRating] = useState(0);
  const [photos, setPhotos] = useState<PickedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const c = COPY[transition];
  // Staff must explain a cancellation; a tenant withdrawing their own report needn't.
  const noteRequired = c.noteRequired || (transition === 'cancel' && !actorIsTenant);
  const photosNeeded = transition === 'complete' && requirePhotos && !photos.length;
  const blocked = (noteRequired && !note.trim()) || photosNeeded;

  const go = async () => {
    setBusy(true); setError(undefined);
    try {
      await transitionRequest(request.id, transition, { note, rating: rating || undefined, photos: transition === 'complete' ? photos : undefined });
      toast(c.done);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={busy ? () => {} : onClose} title={c.title} subtitle={`${request.id} · ${request.title}`} width={480}
      footer={<><Button title="Back" variant="secondary" disabled={busy} onPress={onClose} /><Button title={busy ? 'Saving…' : TRANSITION_LABEL[transition]} variant={transition === 'cancel' || transition === 'dispute' ? 'danger' : 'primary'} loading={busy} disabled={busy || blocked} onPress={() => void go()} /></>}>
      <View style={{ gap: 14 }}>
        <T size={13} color={colors.textSoft}>{c.body}</T>
        {transition === 'confirm' ? (
          <View style={{ gap: 6 }}>
            <T size={12.5} weight="semibold" color={colors.textSoft}>Rate the repair <T size={12.5} color={colors.subtext}>(optional)</T></T>
            <Row gap={6}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Touch key={n} onPress={() => setRating(n === rating ? 0 : n)} accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`}>
                  <Star size={26} color={colors.accent} fill={n <= rating ? colors.accent : 'transparent'} />
                </Touch>
              ))}
            </Row>
          </View>
        ) : null}
        {transition === 'complete' ? (
          <View style={{ gap: 8 }}>
            <T size={12.5} weight="semibold" color={colors.textSoft}>Photos of the finished work {requirePhotos ? <T size={12.5} color={colors.danger}>*</T> : <T size={12.5} color={colors.subtext}>(optional)</T>}</T>
            <PhotoPicker photos={photos} onChange={setPhotos} />
          </View>
        ) : null}
        {c.noteLabel ? <Input label={c.noteLabel} required={noteRequired} optional={!noteRequired} multiline value={note} onChangeText={setNote} /> : null}
        {error ? <Notice tone="danger">{error}</Notice> : null}
      </View>
    </Dialog>
  );
}
