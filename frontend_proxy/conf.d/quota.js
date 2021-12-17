function checkQuota(r) {
    r.error("QUOTA " + r.variables.quota_remaining);
    if (!r.variables.quota_remaining) {
        r.return(401);
    } else if (r.variables.quota_remaining >= 0) {
        r.return(204);
    } else {
        r.return(403);
    }
}
function decrementQuota(r) {
    r.error("DECREMENTING " + r.variables.quota_remaining);
    if (r.variables.quota_remaining) {
        r.variables.quota_remaining--;
    }
    r.return(204);
}

export default {checkQuota, decrementQuota}
