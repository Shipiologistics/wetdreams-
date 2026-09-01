"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Flag, LoaderCircle, Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatRelativeTime, messageForError } from "@/lib/format";

export type HostReview = {
  id: string;
  score: number;
  comment: string | null;
  created_at: string;
  rater_id: string;
  reviewerName: string;
  reviewerUsername: string;
};

export function HostReviewWidget({
  hostId,
  reviews,
  average,
  viewerId,
  canReview,
  existingReview,
}: {
  hostId: string;
  reviews: HostReview[];
  average: number | null;
  viewerId: string | null;
  canReview: boolean;
  existingReview: HostReview | null;
}) {
  const router = useRouter();
  const [score, setScore] = useState(existingReview?.score ?? 5);
  const [comment, setComment] = useState(existingReview?.comment ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const summary = useMemo(() => {
    if (!reviews.length) return "No certified caller reviews yet.";
    return `${average?.toFixed(1)} from ${reviews.length} certified ${reviews.length === 1 ? "caller" : "callers"}`;
  }, [average, reviews.length]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const { error: reviewError } = await createClient().rpc("submit_host_review", {
      p_rated_user: hostId,
      p_score: score,
      p_comment: comment,
    });
    setPending(false);
    if (reviewError) {
      setError(messageForError(reviewError.message));
      return;
    }
    router.refresh();
  }

  async function reportReview(review: HostReview) {
    const reason = window.prompt("Why are you reporting this review?", "Spam or not matching what happened");
    if (!reason) return;
    setPending(true);
    setError(null);
    const response = await fetch("/api/reviews/report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ratingId: review.id, reason }),
    });
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    setPending(false);
    if (!response.ok) {
      setError(messageForError(payload?.error ?? "REPORT_FAILED"));
      return;
    }
    router.refresh();
  }

  const canReportReviews = Boolean(viewerId && viewerId === hostId);

  return (
    <section className="host-reviews-section">
      <div className="host-review-header">
        <div>
          <span className="eyebrow">Certified reviews</span>
          <h2>Caller reviews</h2>
          <p>{summary}</p>
        </div>
        {average && <strong><Star size={18} fill="currentColor" /> {average.toFixed(1)}</strong>}
      </div>

      {viewerId && canReview && (
        <form className="review-form" onSubmit={submit}>
          <div className="star-input" role="radiogroup" aria-label="Review score">
            {[1, 2, 3, 4, 5].map((item) => (
              <button
                aria-checked={score === item}
                className={item <= score ? "active" : ""}
                key={item}
                onClick={() => setScore(item)}
                role="radio"
                type="button"
              >
                <Star size={21} fill="currentColor" />
              </button>
            ))}
          </div>
          <textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={1000} placeholder="Share a short review" rows={3} />
          {error && <p className="card-error" role="alert">{error}</p>}
          <button className="button primary" type="submit" disabled={pending}>
            {pending && <LoaderCircle className="spin" size={18} />}
            {existingReview ? "Update review" : "Post review"}
          </button>
        </form>
      )}

      {viewerId && !canReview && <p className="review-note">Only callers with a completed call can review this profile.</p>}

      <div className="review-list">
        {reviews.map((review) => (
          <article className="review-item" key={review.id}>
            <div>
              <strong>{review.reviewerName}</strong>
              <span>@{review.reviewerUsername} · {formatRelativeTime(review.created_at)}</span>
            </div>
            <span className="rating"><Star size={14} fill="currentColor" /> {review.score.toFixed(1)}</span>
            {review.comment && <p>{review.comment}</p>}
            {canReportReviews && review.rater_id !== viewerId && (
              <button className="button secondary small" type="button" disabled={pending} onClick={() => reportReview(review)}>
                <Flag size={14} /> Report review
              </button>
            )}
          </article>
        ))}
        {!reviews.length && <div className="inline-empty">No reviews yet.</div>}
      </div>
    </section>
  );
}
