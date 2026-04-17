// base.cedar — Service role bypass and user self-management

// Service role (admin/server-side) bypasses all authorization
permit(
    principal is PgrestLambda::ServiceRole,
    action,
    resource
);

// Authenticated users can insert into the users table (self-registration)
permit(
    principal is PgrestLambda::User,
    action == PgrestLambda::Action::"insert",
    resource is PgrestLambda::Table
) when {
    resource == PgrestLambda::Table::"users"
};

// Users can read and update their own user profile
permit(
    principal is PgrestLambda::User,
    action in [PgrestLambda::Action::"select", PgrestLambda::Action::"update"],
    resource is PgrestLambda::Row
) when {
    resource in PgrestLambda::Table::"users" &&
    resource has id && resource.id == principal
};
