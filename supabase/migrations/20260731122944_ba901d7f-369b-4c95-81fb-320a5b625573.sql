DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;

CREATE POLICY "Admins can manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND company_id = public.get_user_company_id(auth.uid())
    AND role <> 'super_admin'::app_role
  )
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND company_id = public.get_user_company_id(auth.uid())
    AND role <> 'super_admin'::app_role
  )
);