/** Upload controls and stored-file viewers, shared by the staff and tenant screens. */
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { Image } from 'expo-image';
import { Camera, Image as ImageIcon, Plus, Upload, X } from 'lucide-react-native';
import { colors, radius } from '../theme';
import type { DocFile } from '../types';
import { checkFile, DOC_TYPES, fmtSize, kindOf, openFile, pickDocuments, pickPhotos, requestPhotos, type Bucket, type PickedFile, type PickResult } from '../lib/files';
import { useStore } from '../store/AppContext';
import { FileRow } from './data';
import { Button, Dialog, Input, Link, Menu, Notice, Row, Select, T, Touch, useToast } from './ui';

const canUseCamera = Platform.OS !== 'web';

/** Runs a picker, then rejects files the bucket won't take. Shows any problem as a toast. */
export function usePick() {
  const toast = useToast();
  return useCallback(async (run: () => Promise<PickResult>, bucket: Bucket, accept: string[]): Promise<PickedFile[]> => {
    const r = await run();
    if ('error' in r) { toast(r.error, 'danger'); return []; }
    const ok: PickedFile[] = [];
    for (const f of r.files) {
      const problem = checkFile(f, bucket, accept);
      if (problem) toast(problem, 'danger');
      else ok.push(f);
    }
    return ok;
  }, [toast]);
}

/** Opens a stored document, or explains why it can't be opened. */
export function useOpenDocument() {
  const toast = useToast();
  return useCallback((d: Pick<DocFile, 'name' | 'storagePath'>, download = false) => {
    if (!d.storagePath) { toast(`${d.name} was recorded before file uploads were switched on, so there is no file to open.`, 'info'); return; }
    openFile('documents', d.storagePath, download ? d.name : undefined).catch((e: unknown) => toast(e instanceof Error ? e.message : String(e), 'danger'));
  }, [toast]);
}

/**
 * One file slot: a dashed drop area until a file is chosen, then the file with a remove button.
 * On phones it also offers the camera, which suits ID cards and paper documents.
 */
export function FileSlot({ file, onChange, accept, bucket = 'documents', title, hint, error, camera }: {
  file?: PickedFile; onChange: (f?: PickedFile) => void; accept: string[]; bucket?: Bucket; title: string; hint: string; error?: string; camera?: boolean;
}) {
  const pick = usePick();
  const choose = async (source: 'files' | 'camera') => {
    const [f] = await pick(() => (source === 'camera' ? pickPhotos('camera') : pickDocuments(accept)), bucket, accept);
    if (f) onChange(f);
  };
  if (file) {
    return (
      <FileRow name={file.name} kind={kindOf(file)} meta={`${fmtSize(file.size)} · ready to upload`}
        right={<Touch onPress={() => onChange(undefined)} accessibilityLabel={`Remove ${file.name}`}><X size={15} color={colors.subtext} /></Touch>} />
    );
  }
  return (
    <View style={{ gap: 6 }}>
      <Touch onPress={() => choose('files')} accessibilityLabel={title}
        style={{ borderWidth: 1.5, borderStyle: 'dashed', borderColor: error ? colors.danger : colors.borderStrong, borderRadius: radius.md, padding: 16, alignItems: 'center', gap: 4 }}
        hoverStyle={{ borderColor: colors.primary, backgroundColor: colors.primaryTint }}>
        <Upload size={16} color={colors.subtext} />
        <T size={12.5} weight="semibold">{title}</T>
        <T size={11} color={colors.subtext} center>{hint}</T>
      </Touch>
      {camera && canUseCamera ? <Link size={12} onPress={() => choose('camera')}>Take a photo instead</Link> : null}
    </View>
  );
}

/** Thumbnails of photos picked for a new request, with an add button (camera or library on phones). */
export function PhotoPicker({ photos, onChange, max = 5 }: { photos: PickedFile[]; onChange: (p: PickedFile[]) => void; max?: number }) {
  const pick = usePick();
  const accept = ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'];
  const add = async (source: 'camera' | 'library') => {
    const room = max - photos.length;
    const picked = await pick(() => pickPhotos(source, room), 'maintenance-photos', accept);
    if (picked.length) onChange([...photos, ...picked].slice(0, max));
  };
  const tile = { width: 76, height: 76, borderRadius: radius.md } as const;
  const addTile = (open?: () => void) => (
    <Touch onPress={open ?? (() => add('library'))} accessibilityLabel="Add photo"
      style={{ ...tile, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.borderStrong, alignItems: 'center', justifyContent: 'center', gap: 2 }}>
      <Plus size={16} color={colors.subtext} /><T size={10.5} color={colors.subtext}>Add photo</T>
    </Touch>
  );
  return (
    <Row gap={10} wrap>
      {photos.map((p, i) => (
        <View key={p.uri + i} style={tile}>
          <Image source={{ uri: p.uri }} style={{ ...tile }} contentFit="cover" accessibilityLabel={p.name} />
          <Touch onPress={() => onChange(photos.filter((_, j) => j !== i))} accessibilityLabel={`Remove ${p.name}`}
            style={{ position: 'absolute', top: 4, right: 4, backgroundColor: colors.card, borderRadius: 10, padding: 2 }}>
            <X size={12} color={colors.textSoft} />
          </Touch>
        </View>
      ))}
      {photos.length < max
        ? canUseCamera
          ? <Menu align="left" width={200} trigger={(open) => addTile(open)} items={[
              { label: 'Take photo', icon: Camera, onPress: () => void add('camera') },
              { label: 'Choose from library', icon: ImageIcon, onPress: () => void add('library') },
            ]} />
          : addTile()
        : null}
    </Row>
  );
}

type Folder = DocFile['folder'];

/**
 * Picks a file, names it, files it in a folder and uploads it.
 * Pass `target` to attach it to a known tenant/property, or `properties` to let the user choose one.
 */
type UploadDocumentProps = {
  open: boolean; onClose: () => void; folders: Folder[]; title?: string;
  target?: { tenantId?: string; propertyId?: string; linkedTo: string };
  properties?: { id: string; label: string }[];
};

/** Remounting on open gives every upload a fresh form. */
export function UploadDocumentDialog(props: UploadDocumentProps) {
  return <UploadDocumentForm key={props.open ? 'open' : 'closed'} {...props} />;
}

function UploadDocumentForm({ open, onClose, folders, target, properties, title = 'Upload document' }: UploadDocumentProps) {
  const { addDocument } = useStore();
  const toast = useToast();
  const [file, setFile] = useState<PickedFile>();
  const [name, setName] = useState('');
  const [folder, setFolder] = useState<Folder>(folders[0]);
  const [prop, setProp] = useState(properties?.[0]?.id ?? '');
  const [expires, setExpires] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const link = target ?? (prop ? { propertyId: prop, linkedTo: properties?.find((p) => p.id === prop)?.label ?? '' } : undefined);
  const badExpiry = !!expires && !/^\d{4}-\d{2}-\d{2}$/.test(expires);
  const upload = async () => {
    if (!file || !link) return;
    setBusy(true); setError(undefined);
    try {
      const doc = await addDocument({ ...link, name: name.trim() || file.name, folder, expires: expires || undefined }, file);
      toast(`${doc.name} uploaded`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? () => {} : onClose} title={title} width={480}
      footer={<><Button title="Cancel" variant="secondary" disabled={busy} onPress={onClose} /><Button title={busy ? 'Uploading…' : 'Upload'} loading={busy} disabled={!file || !link || busy || badExpiry} onPress={() => void upload()} /></>}>
      <View style={{ gap: 14 }}>
        <FileSlot file={file} onChange={(f) => { setFile(f); if (f && !name) setName(f.name); }} accept={DOC_TYPES} title="Choose a file" hint="PDF, Word or photo up to 20 MB" camera />
        <Input label="Document name" value={name} onChangeText={setName} placeholder="Tenancy agreement 2026.pdf" />
        {folders.length > 1 ? <Select label="Folder" value={folder} onChange={(v) => setFolder(v as Folder)} options={folders.map((f) => ({ value: f, label: f }))} /> : null}
        {properties && !target ? <Select label="Property" required value={prop} onChange={setProp} options={properties.map((p) => ({ value: p.id, label: p.label }))} /> : null}
        <Input label="Expiry date" optional value={expires} onChangeText={setExpires} placeholder="YYYY-MM-DD" error={badExpiry ? 'Use the format YYYY-MM-DD.' : undefined} hint="For insurance, permits and IDs that expire." />
        {error ? <Notice tone="danger">{error}</Notice> : null}
      </View>
    </Dialog>
  );
}

/**
 * The stored photos of a maintenance request, read from storage (photos added after the report
 * aren't counted on the request row). Tapping one opens it full size. Change `version` to reload.
 */
export function RequestPhotos({ requestId, title, version = 0, completion = false }: { requestId: string; title?: string; version?: number; completion?: boolean }) {
  const toast = useToast();
  const [result, setResult] = useState<{ requestId: string; photos?: { path: string; url: string }[]; failed?: boolean }>();
  useEffect(() => {
    let live = true;
    requestPhotos(requestId, completion).then((p) => { if (live) setResult({ requestId, photos: p }); }, () => { if (live) setResult({ requestId, failed: true }); });
    return () => { live = false; };
  }, [requestId, version, completion]);
  // Keep showing this request's photos while a newer list loads; never another request's.
  const mine = result?.requestId === requestId ? result : undefined;
  const photos = mine?.photos ?? null;
  const failed = !!mine?.failed;

  const heading = <T size={12} color={colors.subtext} style={{ marginTop: 16, marginBottom: 8 }}>{title ?? 'Photos'}{photos?.length ? ` (${photos.length})` : ''}</T>;
  if (failed) return <>{heading}<T size={12} color={colors.subtext}>Couldn’t load the photos. Check your connection and reopen this request.</T></>;
  if (!photos) return <>{heading}<ActivityIndicator color={colors.primary} style={{ alignSelf: 'flex-start' }} /></>;
  if (!photos.length) return null;
  return (
    <>
      {heading}
      <Row gap={10} wrap>
        {photos.map((p, i) => (
          <Touch key={p.path} accessibilityLabel={`Open photo ${i + 1}`}
            onPress={() => openFile('maintenance-photos', p.path).catch((e: unknown) => toast(e instanceof Error ? e.message : String(e), 'danger'))}>
            <Image source={{ uri: p.url }} style={{ width: 120, height: 86, borderRadius: radius.md, backgroundColor: colors.cardAlt }} contentFit="cover" />
          </Touch>
        ))}
      </Row>
    </>
  );
}
