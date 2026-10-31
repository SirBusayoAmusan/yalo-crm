/**
 * YALO CRM — scheduled reminder push.
 *
 * Every minute, finds reminders that are due and not yet pushed, writes an
 * in-app notification document (so the bell/feed is populated even if the app
 * was never opened) and sends an FCM push to every registered device so the
 * reminder arrives with the app fully closed (iPhone + Android).
 *
 * Deploy with:  firebase deploy --only functions
 * Requires the Firebase Blaze (pay-as-you-go) plan for scheduled functions.
 */
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

exports.sendDueReminders = onSchedule(
  { schedule: "every 1 minutes", timeZone: "Africa/Lagos", region: "us-central1" },
  async () => {
    const nowIso = new Date().toISOString();

    // Due = not done and scheduled time has passed (ISO strings sort chronologically).
    const snap = await db
      .collection("reminders")
      .where("done", "==", false)
      .where("when", "<=", nowIso)
      .get();

    const due = snap.docs.filter((d) => !d.data().pushed);
    if (!due.length) return;

    const tokSnap = await db.collection("pushTokens").get();
    const tokens = tokSnap.docs.map((d) => d.id);
    logger.info(`Reminders due: ${due.length}; devices: ${tokens.length}`);

    for (const docSnap of due) {
      const r = docSnap.data();
      const title = "⏰ Follow-up reminder";
      const body = `${r.company || ""}${r.company ? ": " : ""}${r.note || "Follow up"}`;

      // 1) In-app notification feed entry (idempotent id per reminder)
      const nid = "rem-" + docSnap.id;
      await db.collection("notifications").doc(nid).set({
        id: nid,
        type: "reminder",
        icon: "⏰",
        title,
        desc: body,
        leadId: r.leadId || null,
        ts: new Date().toISOString(),
        read: false,
      });

      // 2) Push to every device (data-only so the client/SW controls display)
      if (tokens.length) {
        try {
          const res = await admin.messaging().sendEachForMulticast({
            tokens,
            data: {
              title,
              body,
              remId: docSnap.id,
              leadId: r.leadId ? String(r.leadId) : "",
            },
            webpush: { fcmOptions: { link: "/" } },
          });
          // Clean up tokens that are no longer valid
          res.responses.forEach((resp, i) => {
            if (!resp.success) {
              const code = resp.error && resp.error.code;
              if (
                code === "messaging/registration-token-not-registered" ||
                code === "messaging/invalid-registration-token" ||
                code === "messaging/invalid-argument"
              ) {
                db.collection("pushTokens").doc(tokens[i]).delete().catch(() => {});
              }
            }
          });
        } catch (e) {
          logger.error("push send failed", e);
        }
      }

      // 3) Mark pushed so it only fires once
      await docSnap.ref.update({ pushed: true });
    }
  }
);
