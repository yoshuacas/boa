// media.cedar — Media uploads (public read is in public_access.cedar)

// Authenticated users can upload media
// (app logic enforces: only admins and coaches of the team)
permit(
    principal is PgrestLambda::User,
    action == PgrestLambda::Action::"insert",
    resource is PgrestLambda::Table
) when {
    resource == PgrestLambda::Table::"media"
};

// Uploaders can update their own media records
permit(
    principal is PgrestLambda::User,
    action == PgrestLambda::Action::"update",
    resource is PgrestLambda::Row
) when {
    resource in PgrestLambda::Table::"media" &&
    resource has uploaded_by && resource.uploaded_by == principal
};

// Uploaders can delete their own media records
permit(
    principal is PgrestLambda::User,
    action == PgrestLambda::Action::"delete",
    resource is PgrestLambda::Row
) when {
    resource in PgrestLambda::Table::"media" &&
    resource has uploaded_by && resource.uploaded_by == principal
};
