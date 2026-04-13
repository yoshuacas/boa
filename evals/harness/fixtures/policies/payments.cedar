// policies/payments.cedar
// Players can view their own payments (read-only from frontend).
// The webhook function uses service_role to write payment records.

// Players can read their own payment records
permit(
    principal is PgrestLambda::User,
    action == PgrestLambda::Action::"select",
    resource is PgrestLambda::Row
) when {
    resource in PgrestLambda::Table::"payments" &&
    resource has user_id && resource.user_id == principal
};

// Players can create payment records (when initiating checkout)
permit(
    principal is PgrestLambda::User,
    action == PgrestLambda::Action::"insert",
    resource is PgrestLambda::Table
) when {
    resource == PgrestLambda::Table::"payments"
};

// Players can read their own notifications
permit(
    principal is PgrestLambda::User,
    action == PgrestLambda::Action::"select",
    resource is PgrestLambda::Row
) when {
    resource in PgrestLambda::Table::"notifications" &&
    resource has user_id && resource.user_id == principal
};

// Players can mark their own notifications as read
permit(
    principal is PgrestLambda::User,
    action == PgrestLambda::Action::"update",
    resource is PgrestLambda::Row
) when {
    resource in PgrestLambda::Table::"notifications" &&
    resource has user_id && resource.user_id == principal
};

// Service role bypasses everything (used by the webhook function)
permit(
    principal is PgrestLambda::ServiceRole,
    action,
    resource
);
