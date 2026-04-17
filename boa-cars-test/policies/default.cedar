// Users can read/update/delete only their own cars
permit(
    principal is PgrestLambda::User,
    action in [PgrestLambda::Action::"select", PgrestLambda::Action::"update", PgrestLambda::Action::"delete"],
    resource is PgrestLambda::Row
) when { resource has user_id && resource.user_id == principal };

// Users can insert new cars
permit(principal is PgrestLambda::User, action == PgrestLambda::Action::"insert", resource is PgrestLambda::Table);

// Service role bypasses all authorization
permit(principal is PgrestLambda::ServiceRole, action, resource);
