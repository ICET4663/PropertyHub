-- Fix: the documents-bucket policies for tenants/<tenantId>/ folders never matched.
--
-- Inside `exists (select 1 from public.tenants t where t.id = (storage.foldername(name))[2])`,
-- the unqualified `name` resolves to tenants.name (the tenant's name), not the object path,
-- so staff could not upload, open or delete tenant files and tenants could not open their own.
-- The object path is now written as `objects.name` everywhere.
--
-- Also limits each bucket to the file types the app offers, so the server rejects anything else.

drop policy if exists "documents bucket: read" on storage.objects;
drop policy if exists "documents bucket: upload" on storage.objects;
drop policy if exists "documents bucket: managers delete" on storage.objects;

create policy "documents bucket: read" on storage.objects for select to authenticated
  using (
    bucket_id = 'documents' and (
      ((storage.foldername(objects.name))[1] = 'properties' and private.can_see_property((storage.foldername(objects.name))[2]))
      or ((storage.foldername(objects.name))[1] = 'tenants' and exists (
            select 1 from public.tenants t where t.id = (storage.foldername(objects.name))[2]))
    )
  );

create policy "documents bucket: upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents' and (
      ((storage.foldername(objects.name))[1] = 'properties' and private.can_manage_property((storage.foldername(objects.name))[2]))
      or ((storage.foldername(objects.name))[1] = 'tenants' and (
            (storage.foldername(objects.name))[2] = private.my_tenant_id()
            or exists (
              select 1 from public.tenants t
              where t.id = (storage.foldername(objects.name))[2] and (private.is_admin() or private.can_manage_property(t.property_id)))
         ))
    )
  );

create policy "documents bucket: managers delete" on storage.objects for delete to authenticated
  using (
    bucket_id = 'documents' and (
      ((storage.foldername(objects.name))[1] = 'properties' and private.can_manage_property((storage.foldername(objects.name))[2]))
      or ((storage.foldername(objects.name))[1] = 'tenants' and exists (
            select 1 from public.tenants t
            where t.id = (storage.foldername(objects.name))[2] and (private.is_admin() or private.can_manage_property(t.property_id))))
    )
  );

update storage.buckets
set allowed_mime_types = array[
  'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp',
  'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]
where id = 'documents';

update storage.buckets
set allowed_mime_types = array['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp']
where id = 'maintenance-photos';
