"""Stage the feeding and Mihai's entrance in the illustrated yard."""

from decor import painted_backdrop
from vector_art import collection


LATE_PERCH = (4.52, .509, -2.73)
LATE_GROUND = (-2.78, -2.99, -.05)
LATE_ROOSTER_SCALE = (-.96, .96, 1)
LATE_BROTHER_DEPTH = -4.0


def build_late_yard(coll):
    landscape = collection("Ograda de dimineață · Peisaj", coll)
    foreground = collection("Ograda de dimineață · Gard și magazie", coll)
    painted_backdrop(landscape, "Ograda de dimineață · peisaj", "ograda-peisaj.png",
                     12.4, center_y=-.12)
    # Keep the shed in front of Mihai while the fence stays behind his walk.
    painted_backdrop(foreground, "Ograda de dimineață · gard și magazie",
                     "ograda-gard-magazie.png", 12.4, center_y=-.12,
                     depth=-5.0, silhouette="ograda-gard-magazie.svg",
                     silhouette_depths={"shed": -3.2, "shed-brace": -3.2})


def mihai_entrance(start, end):
    """Offsets from Mihai's standing position beside Costică."""
    behind_shed = (-4.52, 1.46)
    return [
        (start, *behind_shed),
        (start + 14, *behind_shed),
        (start + 31, -2.93, .66),
        (start + 67, 0, 0),
        (end, 0, 0),
    ]


def mihai_entrance_scale(start, end):
    """Scale relative to Mihai's standing size as he approaches the camera."""
    return [(start, .64), (start + 14, .64), (start + 31, .76),
            (start + 67, 1), (end, 1)]
